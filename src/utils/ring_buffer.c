#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>

struct ring_buffer {
    uint8_t *buffer;
    size_t capacity;
    size_t head;
    size_t tail;
    size_t count;
};

int rb_init(struct ring_buffer *rb, uint8_t *buffer, size_t capacity) {
    rb->buffer = buffer;
    rb->capacity = capacity;
    rb->head = 0;
    rb->tail = 0;
    rb->count = 0;
    return 0;
}

bool rb_is_empty(struct ring_buffer *rb) {
    return rb->count == 0;
}

bool rb_is_full(struct ring_buffer *rb) {
    return rb->count == rb->capacity;
}

size_t rb_available(struct ring_buffer *rb) {
    return rb->capacity - rb->count;
}

int rb_write(struct ring_buffer *rb, const uint8_t *data, size_t len) {
    if (len > rb_available(rb)) return -1;

    for (size_t i = 0; i < len; i++) {
        rb->buffer[rb->head] = data[i];
        rb->head = (rb->head + 1) % rb->capacity;
    }
    rb->count += len;
    return 0;
}

int rb_read(struct ring_buffer *rb, uint8_t *data, size_t len) {
    if (len > rb->count) return -1;

    for (size_t i = 0; i < len; i++) {
        data[i] = rb->buffer[rb->tail];
        rb->tail = (rb->tail + 1) % rb->capacity;
    }
    rb->count -= len;
    return 0;
}
