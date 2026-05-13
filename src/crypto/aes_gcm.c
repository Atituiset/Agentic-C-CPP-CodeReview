#include <stdint.h>
#include <string.h>
#include <openssl/evp.h>
#include <openssl/err.h>

#define AES_KEY_SIZE 32
#define AES_IV_SIZE 12
#define AES_TAG_SIZE 16

struct aes_context {
    EVP_CIPHER_CTX *ctx;
    uint8_t key[AES_KEY_SIZE];
    uint8_t iv[AES_IV_SIZE];
};

int aes_gcm_init(struct aes_context *ctx, const uint8_t *key, const uint8_t *iv) {
    ctx->ctx = EVP_CIPHER_CTX_new();
    if (!ctx->ctx) return -1;

    memcpy(ctx->key, key, AES_KEY_SIZE);
    memcpy(ctx->iv, iv, AES_IV_SIZE);

    EVP_EncryptInit_ex(ctx->ctx, EVP_aes_256_gcm(), NULL, NULL, NULL);
    EVP_CIPHER_CTX_ctrl(ctx->ctx, EVP_CTRL_GCM_SET_IVLEN, AES_IV_SIZE, NULL);
    EVP_EncryptInit_ex(ctx->ctx, NULL, NULL, key, iv);

    return 0;
}

int aes_gcm_encrypt(struct aes_context *ctx, const uint8_t *plaintext,
                    size_t len, uint8_t *ciphertext, uint8_t *tag) {
    int outlen;
    EVP_EncryptUpdate(ctx->ctx, ciphertext, &outlen, plaintext, len);
    EVP_EncryptFinal_ex(ctx->ctx, ciphertext + outlen, &outlen);
    EVP_CIPHER_CTX_ctrl(ctx->ctx, EVP_CTRL_GCM_GET_TAG, AES_TAG_SIZE, tag);
    return 0;
}

void aes_gcm_cleanup(struct aes_context *ctx) {
    if (ctx->ctx) {
        EVP_CIPHER_CTX_free(ctx->ctx);
        ctx->ctx = NULL;
    }
    memset(ctx->key, 0, AES_KEY_SIZE);
    memset(ctx->iv, 0, AES_IV_SIZE);
}
