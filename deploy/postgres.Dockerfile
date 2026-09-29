# PostgreSQL остаётся официальным образом. gosu 1.19 пересобран тем же Go, что Caddy.
FROM golang:1.27.1-alpine@sha256:8a5910f31396cd4d89662f56c68b3ae31d374308270a1c3bd96672ee5ed43414 AS gosu
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
ADD --checksum=sha256:cd9719b775dbfedae53923c9b0dc792b66d42c51e0b36652ed6f747fbadc0164 https://codeload.github.com/tianon/gosu/tar.gz/refs/tags/1.19 /tmp/gosu.tar.gz
RUN tar -xzf /tmp/gosu.tar.gz -C /tmp
WORKDIR /tmp/gosu-1.19
RUN go build -mod=readonly -trimpath -ldflags='-s -w' -o /usr/local/bin/gosu .

FROM postgres:16.15-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
COPY --from=gosu /usr/local/bin/gosu /usr/local/bin/gosu
COPY --from=gosu /tmp/gosu-1.19/LICENSE /usr/share/licenses/club-gosu/LICENSE
RUN gosu nobody true
