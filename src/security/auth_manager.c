#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <openssl/sha.h>

#define MAX_USERS 1024
#define TOKEN_LEN 64
#define HASH_LEN 64

struct user {
    char username[64];
    char password_hash[HASH_LEN + 1];
    char salt[33];
    int active;
};

static struct user users[MAX_USERS];
static int num_users = 0;

void hash_password(const char *password, const char *salt, char *out) {
    char combined[256];
    snprintf(combined, sizeof(combined), "%s%s", password, salt);

    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256((unsigned char *)combined, strlen(combined), hash);

    for (int i = 0; i < SHA256_DIGEST_LENGTH; i++) {
        sprintf(out + (i * 2), "%02x", hash[i]);
    }
    out[HASH_LEN] = '\0';
}

void generate_salt(char *salt) {
    const char chars[] = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    srand((unsigned int)time(NULL));
    for (int i = 0; i < 32; i++) {
        salt[i] = chars[rand() % (sizeof(chars) - 1)];
    }
    salt[32] = '\0';
}

int add_user(const char *username, const char *password) {
    if (num_users >= MAX_USERS) return -1;

    for (int i = 0; i < num_users; i++) {
        if (strcmp(users[i].username, username) == 0) return -1;
    }

    struct user *u = &users[num_users++];
    strncpy(u->username, username, sizeof(u->username) - 1);
    generate_salt(u->salt);
    hash_password(password, u->salt, u->password_hash);
    u->active = 1;

    return 0;
}

int verify_user(const char *username, const char *password) {
    for (int i = 0; i < num_users; i++) {
        if (strcmp(users[i].username, username) == 0) {
            char hash[HASH_LEN + 1];
            hash_password(password, users[i].salt, hash);
            return strcmp(hash, users[i].password_hash) == 0;
        }
    }
    return 0;
}
