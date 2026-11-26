package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"time"

	_ "github.com/go-sql-driver/mysql"
	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	inQueue          = "q.payment_completed"
	reservedQueue    = "q.stock_reserved"
	unavailableQueue = "q.stock_unavailable"
	sagaEventsQueue  = "q.saga_events"
	dsn              = "root:@tcp(localhost:3306)/inventory_db"
)

type Message struct {
	OrderID   int     `json:"order_id"`
	ProductID string  `json:"product_id"`
	Quantity  int     `json:"quantity"`
	Amount    float64 `json:"amount"`
	Event     string  `json:"event"`
	CreatedAt string  `json:"created_at"`
}

type AuditMessage struct {
	OrderID       int    `json:"order_id"`
	Event         string `json:"event"`
	Queue         string `json:"queue"`
	SourceService string `json:"source_service"`
	OccurredAt    string `json:"occurred_at"`
}

func publish(channel *amqp.Channel, queue string, event string, message Message) error {
	message.Event = event
	message.CreatedAt = time.Now().UTC().Format(time.RFC3339)

	if _, err := channel.QueueDeclare(queue, true, false, false, false, nil); err != nil {
		return err
	}

	body, err := json.Marshal(message)
	if err != nil {
		return err
	}

	log.Printf("[go] published %s: %s", event, body)
	return channel.Publish("", queue, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	})
}

func publishAudit(channel *amqp.Channel, sourceService string, event string, orderID int, queue string) error {
	audit := AuditMessage{
		OrderID:       orderID,
		Event:         event,
		Queue:         queue,
		SourceService: sourceService,
		OccurredAt:    time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
	}

	if _, err := channel.QueueDeclare(sagaEventsQueue, true, false, false, false, nil); err != nil {
		return err
	}

	body, err := json.Marshal(audit)
	if err != nil {
		return err
	}

	return channel.Publish("", sagaEventsQueue, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	})
}

// reserveStock records the reservation and decrements stock in one transaction, so a crash
// or DB error cannot leave one without the other. The row lock prevents overselling.
// isNew is false when this order was already processed (redelivered message).
func reserveStock(db *sql.DB, message Message) (status string, isNew bool, err error) {
	tx, err := db.Begin()
	if err != nil {
		return "", false, err
	}
	defer tx.Rollback() // no-op after Commit

	var available int
	err = tx.QueryRow("SELECT available_quantity FROM stock WHERE product_id = ? FOR UPDATE", message.ProductID).Scan(&available)
	if err == sql.ErrNoRows {
		available = 0
	} else if err != nil {
		return "", false, err
	}

	status = "reserved"
	if available < message.Quantity {
		status = "released"
	}

	result, err := tx.Exec(
		"INSERT INTO reservations (order_id, product_id, quantity, status) VALUES (?, ?, ?, ?) "+
			"ON DUPLICATE KEY UPDATE status = status",
		message.OrderID, message.ProductID, message.Quantity, status,
	)
	if err != nil {
		return "", false, err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return "", false, err
	}
	if affected == 0 {
		return status, false, nil
	}

	if status == "reserved" {
		if _, err := tx.Exec(
			"UPDATE stock SET available_quantity = available_quantity - ? WHERE product_id = ?",
			message.Quantity, message.ProductID,
		); err != nil {
			return "", false, err
		}
	}

	return status, true, tx.Commit()
}

func handleMessage(db *sql.DB, channel *amqp.Channel, message Message) error {
	status, isNew, err := reserveStock(db, message)
	if err != nil {
		return err
	}
	if !isNew {
		log.Printf("[go] duplicate payment_completed for order_id=%d, skipping republish", message.OrderID)
		return nil
	}

	queue, event := reservedQueue, "stock_reserved"
	if status == "released" {
		queue, event = unavailableQueue, "stock_unavailable"
	}

	if err := publish(channel, queue, event, message); err != nil {
		return err
	}
	return publishAudit(channel, "go", event, message.OrderID, queue)
}

func main() {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("[go] db open error: %v", err)
	}
	defer db.Close()

	conn, err := amqp.Dial("amqp://guest:guest@localhost:5672/")
	if err != nil {
		log.Fatalf("[go] connect error: %v", err)
	}
	defer conn.Close()

	channel, err := conn.Channel()
	if err != nil {
		log.Fatalf("[go] channel error: %v", err)
	}
	defer channel.Close()

	if _, err := channel.QueueDeclare(inQueue, true, false, false, false, nil); err != nil {
		log.Fatalf("[go] declare in queue error: %v", err)
	}

	msgs, err := channel.Consume(inQueue, "", false, false, false, false, nil)
	if err != nil {
		log.Fatalf("[go] consume error: %v", err)
	}

	log.Println("[go] waiting for messages...")
	for d := range msgs {
		var message Message
		if err := json.Unmarshal(d.Body, &message); err != nil {
			log.Printf("[go] unmarshal error: %v", err)
			d.Nack(false, false)
			continue
		}

		if err := handleMessage(db, channel, message); err != nil {
			log.Printf("[go] handle error: %v", err)
			d.Nack(false, false)
			continue
		}

		d.Ack(false)
	}
}
