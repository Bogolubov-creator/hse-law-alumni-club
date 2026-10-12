FROM golang:1.27.2-alpine@sha256:f92b6ef800e499660581efdabdf25d9d817a9d124eaf900924f0504e7e27e12d AS gosu
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
ADD --checksum=sha256:cd9719b775dbfedae53923c9b0dc792b66d42c51e0b36652ed6f747fbadc0164 https://codeload.github.com/tianon/gosu/tar.gz/refs/tags/1.19 /tmp/gosu.tar.gz
RUN tar -xzf /tmp/gosu.tar.gz -C /tmp
WORKDIR /tmp/gosu-1.19
RUN go get golang.org/x/sys@v0.49.0 github.com/moby/sys/user@v0.4.1 && go mod tidy && \
    go build -mod=readonly -trimpath -ldflags='-s -w' -o /usr/local/bin/gosu . && \
    go version -m /usr/local/bin/gosu > /tmp/gosu-build-info.txt && \
    grep -E 'dep[[:space:]]+golang.org/x/sys[[:space:]]+v0.49.0[[:space:]]' /tmp/gosu-build-info.txt && \
    grep -E 'dep[[:space:]]+github.com/moby/sys/user[[:space:]]+v0.4.1[[:space:]]' /tmp/gosu-build-info.txt

FROM postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873
COPY --from=gosu /usr/local/bin/gosu /usr/local/bin/gosu
COPY --from=gosu /tmp/gosu-1.19/LICENSE /usr/share/licenses/club-gosu/LICENSE
RUN apk add --no-cache 'zlib>=1.3.2-r1' && gosu nobody true
