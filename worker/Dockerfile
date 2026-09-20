FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY worker.py database.py models.py job_service.py ./

CMD ["python", "worker.py"]