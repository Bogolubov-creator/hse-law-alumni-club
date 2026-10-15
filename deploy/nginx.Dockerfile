FROM nginx:1.30.6-alpine@sha256:ff8328b4279ec385af48cde9ef486e7165ad74b7065cb3cd86c377384e2e2dd5
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
RUN apk upgrade --no-cache && apk add --no-cache 'libexpat>=2.8.5-r0' 'pcre2>=10.49-r0'
USER 101:101
