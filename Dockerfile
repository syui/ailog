# Multi-stage build for ailog
FROM rust:1.75 as builder

WORKDIR /usr/src/app
COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN cargo build --release

FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary
COPY --from=builder /usr/src/app/target/release/ailog /usr/local/bin/ailog

# Copy blog content
COPY my-blog ./blog

# Build static site
RUN ailog build blog

# Expose port
EXPOSE 8080

# Run server
CMD ["ailog", "serve", "blog"]