import csv
import os
from time import perf_counter


def analyze_csv(file_path: str) -> dict:
    start_time = perf_counter()

    file_size = os.path.getsize(file_path)

    with open(
        file_path,
        mode="r",
        newline="",
        encoding="utf-8",
    ) as csv_file:
        reader = csv.reader(csv_file)

        header = next(reader, [])
        rows = sum(1 for _ in reader)

    processing_time = perf_counter() - start_time

    return {
        "rows": rows,
        "columns": len(header),
        "file_size_bytes": file_size,
        "processing_time_seconds": round(processing_time, 4),
    }