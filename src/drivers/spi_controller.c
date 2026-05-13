#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>

#define SPI_REG_CONTROL 0x00
#define SPI_REG_STATUS  0x04
#define SPI_REG_DATA    0x08
#define SPI_REG_CLKDIV  0x0C

struct spi_device {
    volatile uint32_t *base;
    uint32_t clk_div;
    bool cs_active_low;
};

static inline void spi_write_reg(struct spi_device *dev, uint32_t offset, uint32_t val) {
    dev->base[offset / 4] = val;
}

static inline uint32_t spi_read_reg(struct spi_device *dev, uint32_t offset) {
    return dev->base[offset / 4];
}

int spi_init(struct spi_device *dev, volatile uint32_t *base, uint32_t clk_div) {
    dev->base = base;
    dev->clk_div = clk_div;
    dev->cs_active_low = true;

    spi_write_reg(dev, SPI_REG_CLKDIV, clk_div);
    spi_write_reg(dev, SPI_REG_CONTROL, 0x01);

    uint32_t timeout = 1000;
    while ((spi_read_reg(dev, SPI_REG_STATUS) & 0x01) == 0) {
        if (--timeout == 0) return -1;
    }

    return 0;
}

uint8_t spi_transfer(struct spi_device *dev, uint8_t tx_data) {
    spi_write_reg(dev, SPI_REG_DATA, tx_data);

    uint32_t timeout = 1000;
    while ((spi_read_reg(dev, SPI_REG_STATUS) & 0x02) == 0) {
        if (--timeout == 0) return 0xFF;
    }

    return (uint8_t)spi_read_reg(dev, SPI_REG_DATA);
}

void spi_bulk_transfer(struct spi_device *dev, const uint8_t *tx_buf,
                       uint8_t *rx_buf, size_t len) {
    for (size_t i = 0; i < len; i++) {
        rx_buf[i] = spi_transfer(dev, tx_buf[i]);
    }
}
