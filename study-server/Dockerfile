FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV STUDY_DATA_DIR=/data
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "server.js"]
