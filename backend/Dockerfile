FROM python:3.12-slim

WORKDIR /app

# NOTE: no apt packages needed - all requirements ship cp312 wheels,
# and the backend code uses no curl. (apt-get update fails here:
# deb.debian.org returns 403 from container egress; host gets 200.)

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONPATH=/app
ENV PORT=8080

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-server-header"]
