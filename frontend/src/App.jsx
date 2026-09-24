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
  const [selectedJobId, setSelectedJobId] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortOrder, setSortOrder] = useState("NEWEST");

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

  const selectedJob = jobs.find(
    (job) => job.id === selectedJobId
  );

  const handleDeleteJob = async () => {
    if (!selectedJob) {
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${selectedJob.filename}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/jobs/${selectedJob.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to delete job");
      }

      setJobs((currentJobs) =>
        currentJobs.filter((job) => job.id !== selectedJob.id)
      );

      setSelectedJobId(null);
      setMessage("Job deleted successfully.");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const filteredJobs = [...jobs]
    .filter((job) => {
      const matchesSearch = job.filename
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" || job.status === statusFilter;

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();

      return sortOrder === "NEWEST"
        ? dateB - dateA
        : dateA - dateB;
  });

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

            <span className="job-count">{
            filteredJobs.length}{" "}
            {filteredJobs.length === 1 ? "job" : "jobs"}
            </span>
          </div>

          <div className="job-controls">
            <div className="job-search">
              <span>⌕</span>

              <input
                type="text"
                placeholder="Search jobs by filename..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value="QUEUED">Queued</option>
              <option value="PROCESSING">Processing</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
            </select>

            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            >
              <option value="NEWEST">Newest First</option>
              <option value="OLDEST">Oldest First</option>
            </select>
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
          ) : filteredJobs.length === 0 ? (
            <div className="state-card">
              <div className="empty-icon">⌕</div>
              <h4>No matching jobs</h4>
              <p>Try changing your search or filter.</p>
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
                {filteredJobs.map((job) => (
                  <article
                    className="job-row"
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                  >
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

      {selectedJob && (
        <div
          className="job-modal-overlay"
          onClick={() => setSelectedJobId(null)}
        >
          <div
            className="job-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="job-modal-header">
              <div>
                <p className="eyebrow">JOB DETAILS</p>
                <h3>{selectedJob.filename}</h3>
              </div>

              <button
                className="modal-close"
                onClick={() => setSelectedJobId(null)}
              >
                ×
              </button>
            </div>

            <div className="job-modal-status">
              <span
                className={`status-badge ${getStatusClass(
                  selectedJob.status
                )}`}
              >
                <span>{getStatusIcon(selectedJob.status)}</span>
                {selectedJob.status}
              </span>
            </div>

            <div className="job-timeline">
              <div className="timeline-item completed">
                <div className="timeline-marker">✓</div>

                <div className="timeline-content">
                  <strong>Created</strong>
                  <span>
                    {new Date(
                      selectedJob.created_at
                    ).toLocaleString()}
                  </span>
                </div>
              </div>

              <div
                className={`timeline-item ${
                  selectedJob.started_at ? "completed" : "pending"
                }`}
              >
                <div className="timeline-marker">
                  {selectedJob.started_at ? "✓" : "•"}
                </div>

                <div className="timeline-content">
                  <strong>Processing</strong>

                  <span>
                    {selectedJob.started_at
                      ? new Date(
                          selectedJob.started_at
                        ).toLocaleString()
                      : "Waiting to start"}
                  </span>
                </div>
              </div>

              <div
                className={`timeline-item ${
                  selectedJob.status === "COMPLETED"
                    ? "completed"
                    : selectedJob.status === "FAILED"
                    ? "failed"
                    : "pending"
                }`}
              >
                <div className="timeline-marker">
                  {selectedJob.status === "COMPLETED"
                    ? "✓"
                    : selectedJob.status === "FAILED"
                    ? "×"
                    : "•"}
                </div>

                <div className="timeline-content">
                  <strong>
                    {selectedJob.status === "FAILED"
                      ? "Failed"
                      : "Completed"}
                  </strong>

                  <span>
                    {selectedJob.completed_at
                      ? new Date(
                          selectedJob.completed_at
                        ).toLocaleString()
                      : "Waiting for completion"}
                  </span>
                </div>
              </div>
            </div>

            {selectedJob.result && (
              <div className="job-result-details">
                <p className="eyebrow">RESULT</p>

                <div className="result-grid">
                  <div>
                    <span>Rows</span>
                    <strong>
                      {selectedJob.result.rows?.toLocaleString() ?? "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Columns</span>
                    <strong>
                      {selectedJob.result.columns ?? "—"}
                    </strong>
                  </div>

                  <div>
                    <span>File Size</span>
                    <strong>
                      {selectedJob.result.file_size_bytes
                        ? `${(
                            selectedJob.result.file_size_bytes /
                            (1024 * 1024)
                          ).toFixed(2)} MB`
                        : "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Processing Time</span>
                    <strong>
                      {selectedJob.result.processing_time_seconds != null
                        ? `${selectedJob.result.processing_time_seconds}s`
                        : "—"}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {selectedJob.error && (
              <div className="job-error-details">
                <p className="eyebrow">ERROR</p>
                <p>{selectedJob.error}</p>
              </div>
            )}

            <div className="job-id-details">
              <span>Job ID</span>
              <code>{selectedJob.id}</code>
            </div>

            {(selectedJob.status === "COMPLETED" ||
              selectedJob.status === "FAILED") && (
              <button
                className="delete-job-button"
                onClick={handleDeleteJob}
              >
                Delete Job
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;