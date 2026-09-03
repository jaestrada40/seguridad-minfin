FROM python:3.12-slim
WORKDIR /app
COPY app ./app
COPY scripts ./scripts
RUN mkdir -p /app/data
CMD ["python", "-u", "-m", "app.main"]
