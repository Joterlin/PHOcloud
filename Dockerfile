FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    PHOCLOUD_DATABASE_PATH=/app/storage/data/phocloud.db \
    PHOCLOUD_UPLOADS_DIRECTORY=/app/storage/uploads \
    PHOCLOUD_TRANSFERS_DIRECTORY=/app/storage/transfers \
    PHOCLOUD_BACKUP_DIRECTORY=/app/storage/backups

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY Backend ./Backend
COPY Frontend ./Frontend
COPY public ./public
COPY scripts ./scripts
COPY README.md DEPLOYMENT.md ./

RUN mkdir -p /app/storage/data /app/storage/uploads /app/storage/transfers /app/storage/backups \
    && chown -R node:node /app/storage

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "run", "start:production"]
