#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define MAX_HEADER_SIZE 8192
#define MAX_HEADERS 64

struct http_header {
    char name[256];
    char value[1024];
};

struct http_request {
    char method[16];
    char path[1024];
    char version[16];
    struct http_header headers[MAX_HEADERS];
    int num_headers;
    char *body;
    size_t body_len;
};

static char *trim_whitespace(char *str) {
    while (isspace((unsigned char)*str)) str++;
    if (*str == '\0') return str;
    char *end = str + strlen(str) - 1;
    while (end > str && isspace((unsigned char)*end)) end--;
    end[1] = '\0';
    return str;
}

int parse_request_line(char *line, struct http_request *req) {
    char *method = strtok(line, " ");
    char *path = strtok(NULL, " ");
    char *version = strtok(NULL, "\r\n");

    if (!method || !path || !version) return -1;

    strncpy(req->method, method, sizeof(req->method) - 1);
    strncpy(req->path, path, sizeof(req->path) - 1);
    strncpy(req->version, version, sizeof(req->version) - 1);

    return 0;
}

int parse_header_line(char *line, struct http_header *header) {
    char *colon = strchr(line, ':');
    if (!colon) return -1;

    *colon = '\0';
    strncpy(header->name, trim_whitespace(line), sizeof(header->name) - 1);
    strncpy(header->value, trim_whitespace(colon + 1), sizeof(header->value) - 1);

    return 0;
}

int http_parse(const char *data, size_t len, struct http_request *req) {
    memset(req, 0, sizeof(*req));

    char *buf = malloc(len + 1);
    memcpy(buf, data, len);
    buf[len] = '\0';

    char *line = strtok(buf, "\r\n");
    if (!line) {
        free(buf);
        return -1;
    }

    if (parse_request_line(line, req) < 0) {
        free(buf);
        return -1;
    }

    while ((line = strtok(NULL, "\r\n")) != NULL && req->num_headers < MAX_HEADERS) {
        if (strlen(line) == 0) break;
        parse_header_line(line, &req->headers[req->num_headers++]);
    }

    free(buf);
    return 0;
}
