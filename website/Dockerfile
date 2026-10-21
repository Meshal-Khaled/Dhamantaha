# The website: the pages built by `npm run build` (dist/) served by an unprivileged nginx.
# Build dist/ first (npm run deploy:ring does it for you); the image only copies it.
FROM nginxinc/nginx-unprivileged:stable-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/headers.inc /etc/nginx/headers.inc
COPY dist/ /usr/share/nginx/html/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
