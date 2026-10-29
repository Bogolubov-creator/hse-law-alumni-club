FROM nginx:1.30.6-alpine@sha256:0e52bd054126cdc040b1276c0af347aeb02a41b9cfe305d6094767ac30e97949
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
RUN apk upgrade --no-cache && apk add --no-cache 'libexpat>=2.8.5-r0' 'pcre2>=10.49-r0'
USER 101:101
