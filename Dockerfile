FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
# Database, backups and uploaded images live here — mount a volume so they survive updates.
ENV DATA_DIR=/data/db UPLOAD_DIR=/data/uploads
VOLUME ["/data"]
EXPOSE 3000
USER node
CMD ["node", "--no-warnings", "server/index.js"]
