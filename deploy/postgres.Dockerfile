FROM golang:1.27.3-alpine@sha256:d200d2dd76b03a99b52651fd1325aff7dcd35422c35c01bac56571b0507f3deb AS gosu
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
ADD --checksum=sha256:207a2045e890d3ca3326027c5f585733085960b401a49dbc00e3bb628c054cf8 https://codeload.github.com/tianon/gosu/tar.gz/refs/tags/1.20 /tmp/gosu.tar.gz
RUN tar -xzf /tmp/gosu.tar.gz -C /tmp
WORKDIR /tmp/gosu-1.20
RUN go get golang.org/x/sys@v0.49.0 github.com/moby/sys/user@v0.5.0 && go mod tidy && \
    go build -mod=readonly -trimpath -ldflags='-s -w' -o /usr/local/bin/gosu . && \
    go version -m /usr/local/bin/gosu > /tmp/gosu-build-info.txt && \
    grep -E 'dep[[:space:]]+golang.org/x/sys[[:space:]]+v0.49.0[[:space:]]' /tmp/gosu-build-info.txt && \
    grep -E 'dep[[:space:]]+github.com/moby/sys/user[[:space:]]+v0.5.0[[:space:]]' /tmp/gosu-build-info.txt

FROM postgres:16.15-alpine@sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab
COPY --from=gosu /usr/local/bin/gosu /usr/local/bin/gosu
COPY --from=gosu /tmp/gosu-1.20/LICENSE /usr/share/licenses/club-gosu/LICENSE
RUN apk add --no-cache 'zlib>=1.3.2-r1' && gosu nobody true
