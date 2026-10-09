FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATA_DIR=/data SECURE_COOKIES=1
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY lib/portrait.ts ./lib/portrait.ts
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
CMD ["node", "server/index.mjs"]
