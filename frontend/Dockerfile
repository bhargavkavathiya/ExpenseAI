# ---- build ----
FROM node:20-alpine AS build
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build -- --configuration=production

# ---- runtime ----
FROM nginx:1.27-alpine AS runtime

# Non-root: nginx:alpine ships with user `nginx` (UID 101). We reuse it and
# pre-create the writable dirs it needs so it can run without root. The pid
# and proxy-temp paths are redirected to /tmp in nginx.conf because /var/run
# is read-only in many base images when not running as root.
RUN apk add --no-cache wget \
 && mkdir -p /var/cache/nginx /var/log/nginx \
 && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /usr/share/nginx/html

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=nginx:nginx /src/dist/frontend/browser /usr/share/nginx/html

USER nginx
EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
