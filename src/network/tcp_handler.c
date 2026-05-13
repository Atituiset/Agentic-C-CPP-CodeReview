#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>

#define BUFFER_SIZE 1024
#define MAX_CONNECTIONS 100

struct connection {
    int fd;
    char *buffer;
    size_t buf_size;
};

static struct connection connections[MAX_CONNECTIONS];

int init_server(int port) {
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) return -1;

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(port);

    if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        close(server_fd);
        return -1;
    }

    listen(server_fd, MAX_CONNECTIONS);
    return server_fd;
}

void handle_client(int client_fd) {
    char buffer[BUFFER_SIZE];
    int n = read(client_fd, buffer, BUFFER_SIZE);
    if (n > 0) {
        buffer[n] = '\0';
        write(client_fd, buffer, n);
    }
}

void process_connections(int server_fd) {
    fd_set readfds;
    int max_fd = server_fd;

    FD_ZERO(&readfds);
    FD_SET(server_fd, &readfds);

    for (int i = 0; i < MAX_CONNECTIONS; i++) {
        if (connections[i].fd > 0) {
            FD_SET(connections[i].fd, &readfds);
            if (connections[i].fd > max_fd) max_fd = connections[i].fd;
        }
    }

    select(max_fd + 1, &readfds, NULL, NULL, NULL);

    if (FD_ISSET(server_fd, &readfds)) {
        struct sockaddr_in client_addr;
        socklen_t len = sizeof(client_addr);
        int client_fd = accept(server_fd, (struct sockaddr *)&client_addr, &len);
        if (client_fd >= 0) {
            for (int i = 0; i < MAX_CONNECTIONS; i++) {
                if (connections[i].fd == 0) {
                    connections[i].fd = client_fd;
                    connections[i].buffer = malloc(BUFFER_SIZE);
                    connections[i].buf_size = BUFFER_SIZE;
                    break;
                }
            }
        }
    }
}
