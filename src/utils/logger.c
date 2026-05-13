#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <time.h>
#include <pthread.h>

#define LOG_BUFFER_SIZE 4096
#define MAX_LOG_FILES 10

enum log_level {
    LOG_DEBUG = 0,
    LOG_INFO,
    LOG_WARN,
    LOG_ERROR,
    LOG_FATAL
};

struct logger {
    FILE *fp;
    enum log_level level;
    pthread_mutex_t lock;
    char *buffer;
    size_t buf_size;
};

static struct logger g_logger = {NULL, LOG_INFO, PTHREAD_MUTEX_INITIALIZER, NULL, 0};

static const char *level_str[] = {"DEBUG", "INFO", "WARN", "ERROR", "FATAL"};

int logger_init(const char *filename, enum log_level level) {
    g_logger.fp = fopen(filename, "a");
    if (!g_logger.fp) return -1;

    g_logger.level = level;
    g_logger.buffer = malloc(LOG_BUFFER_SIZE);
    g_logger.buf_size = LOG_BUFFER_SIZE;

    return 0;
}

void log_write(enum log_level level, const char *file, int line, const char *fmt, ...) {
    if (level < g_logger.level) return;

    pthread_mutex_lock(&g_logger.lock);

    time_t now = time(NULL);
    struct tm *tm_info = localtime(&now);
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", tm_info);

    int n = snprintf(g_logger.buffer, g_logger.buf_size,
                     "[%s] [%s] %s:%d ", timestamp, level_str[level], file, line);

    va_list args;
    va_start(args, fmt);
    vsnprintf(g_logger.buffer + n, g_logger.buf_size - n, fmt, args);
    va_end(args);

    strncat(g_logger.buffer, "\n", g_logger.buf_size - strlen(g_logger.buffer) - 1);

    fputs(g_logger.buffer, g_logger.fp);
    fflush(g_logger.fp);

    pthread_mutex_unlock(&g_logger.lock);
}

void logger_close(void) {
    if (g_logger.fp) {
        fclose(g_logger.fp);
        g_logger.fp = NULL;
    }
    free(g_logger.buffer);
    g_logger.buffer = NULL;
}
