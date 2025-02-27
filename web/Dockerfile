FROM ubuntu:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsqlite3-dev


COPY . /app
WORKDIR /app

ENV DB_PATH "/app/database.db"

RUN make  # Compile your application

EXPOSE 8000
EXPOSE 8443

CMD ["./server.exe"]