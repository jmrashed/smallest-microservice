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

func publish(channel *amqp.Channel, queue string, event string, message Message) error {
	message.Event = event
	message.CreatedAt = time.Now().UTC().Format(time.RFC3339)

	if _, err := channel.QueueDeclare(queue, false, false, false, false, nil); err != nil {
		return err
	}

	body, err := json.Marshal(message)
	if err != nil {
		return err
	}

	log.Printf("[go] published %s: %s", event, body)
	return channel.Publish("", queue, false, false, amqp.Publishing{
		ContentType: "application/json",
		Body:        body,
	})
}

func handleMessage(db *sql.DB, channel *amqp.Channel, message Message) error {
	var available int
	err := db.QueryRow("SELECT available_quantity FROM stock WHERE product_id = ?", message.ProductID).Scan(&available)
	if err == sql.ErrNoRows {
		available = 0
	} else if err != nil {
		return err
	}

	if available < message.Quantity {
		if _, err := db.Exec(
			"INSERT INTO reservations (order_id, product_id, quantity, status) VALUES (?, ?, ?, 'released') "+
				"ON DUPLICATE KEY UPDATE status = status",
			message.OrderID, message.ProductID, message.Quantity,
		); err != nil {
			return err
		}
		return publish(channel, unavailableQueue, "stock_unavailable", message)
	}

	if _, err := db.Exec(
		"INSERT INTO reservations (order_id, product_id, quantity, status) VALUES (?, ?, ?, 'reserved') "+
			"ON DUPLICATE KEY UPDATE status = status",
		message.OrderID, message.ProductID, message.Quantity,
	); err != nil {
		return err
	}

	if _, err := db.Exec(
		"UPDATE stock SET available_quantity = available_quantity - ? WHERE product_id = ?",
		message.Quantity, message.ProductID,
	); err != nil {
		return err
	}

	return publish(channel, reservedQueue, "stock_reserved", message)
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

	if _, err := channel.QueueDeclare(inQueue, false, false, false, false, nil); err != nil {
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
