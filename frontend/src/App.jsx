import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:8080/api";

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef(null);

  const fetchJobs = async () => {
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/jobs/`);

      if (!response.ok) {
        throw new Error("Failed to fetch jobs");
      }

      const data = await response.json();
      setJobs(data);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const watchJob = (jobId) => {
    const eventSource = new EventSource(
      `${API_URL}/jobs/${jobId}/events`
    );

    eventSource.onmessage = (event) => {
      const updatedJob = JSON.parse(event.data);

      if (updatedJob.error && !updatedJob.status) {
        setMessage(updatedJob.error);
        eventSource.close();
        return;
      }

      setJobs((currentJobs) =>
        currentJobs.map((job) =>
          job.id === updatedJob.id
            ? { ...job, ...updatedJob }
            : job
        )
      );

      if (updatedJob.status === "COMPLETED") {
        setMessage("Job completed successfully.");
        eventSource.close();
      }

      if (updatedJob.status === "FAILED") {
        setMessage(updatedJob.error || "Job processing failed.");
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleFileSelect = (file) => {
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setMessage("Only CSV files are supported.");
      setSelectedFile(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessage("File size must be smaller than 10 MB.");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setMessage("");
  };

  const handleFileInput = (event) => {
    handleFileSelect(event.target.files[0]);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);

    const file = event.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleUpload = async (event) => {
    event.preventDefault();

    if (!selectedFile) {
      setMessage("Please select a CSV file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    setUploading(true);
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/jobs/`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      setMessage("Job submitted successfully.");
      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await fetchJobs();
      watchJob(data.id);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setUploading(false);
    }
  };

  const getStatusClass = (status) => {
    return status.toLowerCase();
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "COMPLETED":
        return "✓";
      case "FAILED":
        return "×";
      case "PROCESSING":
        return "◌";
      case "QUEUED":
        return "◷";
      default:
        return "•";
    }
  };

  const totalJobs = jobs.length;
  const queuedJobs = jobs.filter(
    (job) => job.status === "QUEUED"
  ).length;

  const processingJobs = jobs.filter(
    (job) => job.status === "PROCESSING"
  ).length;

  const completedJobs = jobs.filter(
    (job) => job.status === "COMPLETED"
  ).length;

  const failedJobs = jobs.filter(
    (job) => job.status === "FAILED"
  ).length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">J</div>

          <div>
            <h1>JobFlow</h1>
            <span>Distributed Processing</span>
          </div>
        </div>

        <nav className="navigation">
          <button className="nav-item active">
            <span>▦</span>
            Dashboard
          </button>

          <button
            className="nav-item"
            onClick={() => window.scrollTo(0, 0)}
          >
            <span>↗</span>
            Upload Job
          </button>

          <button
            className="nav-item"
            onClick={() =>
              document
                .querySelector(".jobs-section")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <span>≡</span>
            Job History
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="system-status">
            <span className="status-dot"></span>

            <div>
              <strong>System Online</strong>
              <small>All services operational</small>
            </div>
          </div>

          <span className="version">v1.1</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">JOB PROCESSING</p>
            <h2>Dashboard</h2>

            <p className="topbar-description">
              Upload, process, and monitor your distributed jobs.
            </p>
          </div>

          <button
            className="refresh-button"
            onClick={fetchJobs}
            disabled={loading}
          >
            <span className={loading ? "refresh spinning" : "refresh"}>
              ↻
            </span>

            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon total">Σ</div>

            <div>
              <span>Total Jobs</span>
              <strong>{totalJobs}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon queued">◷</div>

            <div>
              <span>Queued</span>
              <strong>{queuedJobs}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon processing">◌</div>

            <div>
              <span>Processing</span>
              <strong>{processingJobs}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon completed">✓</div>

            <div>
              <span>Completed</span>
              <strong>{completedJobs}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon failed">×</div>

            <div>
              <span>Failed</span>
              <strong>{failedJobs}</strong>
            </div>
          </div>
        </section>

        <section className="upload-section">
          <div className="section-title">
            <div>
              <p className="eyebrow">NEW JOB</p>
              <h3>Process a CSV file</h3>
            </div>
          </div>

          <form onSubmit={handleUpload}>
            <div
              className={`drop-zone ${dragActive ? "drag-active" : ""} ${
                selectedFile ? "has-file" : ""
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                hidden
              />

              {!selectedFile ? (
                <>
                  <div className="upload-icon">↑</div>

                  <h4>Drop your CSV file here</h4>

                  <p>
                    or <span>browse from your computer</span>
                  </p>

                  <small>
                    CSV files only · Maximum size 10 MB
                  </small>
                </>
              ) : (
                <>
                  <div className="file-icon">CSV</div>

                  <h4>{selectedFile.name}</h4>

                  <p>
                    {(selectedFile.size / 1024).toFixed(1)} KB · Ready to
                    process
                  </p>

                  <button
                    type="button"
                    className="remove-file"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedFile(null);

                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                  >
                    Remove file
                  </button>
                </>
              )}
            </div>

            <div className="upload-actions">
              <div className="upload-message">
                {message && (
                  <span
                    className={
                      message.toLowerCase().includes("success")
                        ? "success-message"
                        : "error-message"
                    }
                  >
                    {message}
                  </span>
                )}
              </div>

              <button
                className="submit-button"
                type="submit"
                disabled={uploading || !selectedFile}
              >
                {uploading ? (
                  <>
                    <span className="button-spinner"></span>
                    Uploading...
                  </>
                ) : (
                  <>
                    Process CSV
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        <section className="jobs-section">
          <div className="section-title jobs-title">
            <div>
              <p className="eyebrow">ACTIVITY</p>
              <h3>Recent Jobs</h3>
            </div>

            <span className="job-count">
              {totalJobs} {totalJobs === 1 ? "job" : "jobs"}
            </span>
          </div>

          {loading && jobs.length === 0 ? (
            <div className="state-card">
              <div className="loader"></div>
              <p>Loading jobs...</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="state-card">
              <div className="empty-icon">≡</div>
              <h4>No jobs yet</h4>
              <p>Upload your first CSV file to start processing.</p>
            </div>
          ) : (
            <div className="jobs-table-wrapper">
              <div className="jobs-table-header">
                <span>FILE</span>
                <span>STATUS</span>
                <span>CREATED</span>
                <span>RESULT</span>
              </div>

              <div className="jobs-list">
                {jobs.map((job) => (
                  <article className="job-row" key={job.id}>
                    <div className="file-column">
                      <div className="csv-icon">CSV</div>

                      <div>
                        <strong>{job.filename}</strong>
                        <small>{job.id}</small>
                      </div>
                    </div>

                    <div>
                      <span
                        className={`status-badge ${getStatusClass(
                          job.status
                        )}`}
                      >
                        <span>{getStatusIcon(job.status)}</span>
                        {job.status}
                      </span>
                    </div>

                    <div className="date-column">
                      {new Date(job.created_at).toLocaleString()}
                    </div>

                    <div className="result-column">
                      {job.result ? (
                        <div className="result-summary">
                          <span>
                            {job.result.rows} rows · {job.result.columns} cols
                          </span>

                          <small>
                            {job.result.processing_time_seconds}s
                          </small>
                        </div>
                      ) : job.error ? (
                        <span className="failed-result">
                          Processing failed
                        </span>
                      ) : (
                        <span className="pending-result">
                          Waiting...
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;