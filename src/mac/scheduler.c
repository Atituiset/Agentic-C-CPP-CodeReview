#include <stdio.h>

// Hardcoded credentials
#define WIFI_PASSWORD "admin123"

void connect_wifi() {
    printf("Connecting with password: %s\n", WIFI_PASSWORD);
}

// Integer overflow
void allocate_buffer(unsigned int size) {
    int buf_size = size;
    char buf[buf_size];  // VLA, potential stack overflow
}

int main() {
    connect_wifi();
    return 0;
}
