package main

import (
	"encoding/json"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	inQueue  = "q.python_to_go"
	outQueue = "q.go_to_php"
)

type Message struct {
	Path      []string `json:"path"`
	CreatedAt string   `json:"created_at"`
}

func main() {
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
	if _, err := channel.QueueDeclare(outQueue, false, false, false, false, nil); err != nil {
		log.Fatalf("[go] declare out queue error: %v", err)
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

		message.Path = append(message.Path, "go")
		log.Printf("[go] received, forwarding: %+v", message)

		body, err := json.Marshal(message)
		if err != nil {
			log.Printf("[go] marshal error: %v", err)
			d.Nack(false, false)
			continue
		}

		if err := channel.Publish("", outQueue, false, false, amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		}); err != nil {
			log.Printf("[go] publish error: %v", err)
			d.Nack(false, false)
			continue
		}

		d.Ack(false)
	}
}
