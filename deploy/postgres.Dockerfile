FROM golang:1.27.2-alpine@sha256:f92b6ef800e499660581efdabdf25d9d817a9d124eaf900924f0504e7e27e12d AS gosu
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
ADD --checksum=sha256:cd9719b775dbfedae53923c9b0dc792b66d42c51e0b36652ed6f747fbadc0164 https://codeload.github.com/tianon/gosu/tar.gz/refs/tags/1.19 /tmp/gosu.tar.gz
RUN tar -xzf /tmp/gosu.tar.gz -C /tmp
WORKDIR /tmp/gosu-1.19
RUN go build -mod=readonly -trimpath -ldflags='-s -w' -o /usr/local/bin/gosu .

FROM postgres:16.15-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
COPY --from=gosu /usr/local/bin/gosu /usr/local/bin/gosu
COPY --from=gosu /tmp/gosu-1.19/LICENSE /usr/share/licenses/club-gosu/LICENSE
RUN gosu nobody true
