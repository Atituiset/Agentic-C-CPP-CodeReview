#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Potential memory leak: no free for buffer
void process_timer(int id) {
    char *buffer = malloc(1024);
    sprintf(buffer, "Timer %d triggered", id);
    printf("%s\n", buffer);
    // Missing: free(buffer);
}

// Potential buffer overflow
void copy_data(const char *input) {
    char local[64];
    strcpy(local, input);  // No bounds checking
    printf("Copied: %s\n", local);
}

int main() {
    process_timer(1);
    copy_data("Hello World");
    return 0;
}
