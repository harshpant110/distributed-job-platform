import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:8000";

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const fetchJobs = async () => {
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/jobs/`);

      if (!response.ok) {
        throw new Error("Failed to fetch jobs");
      }

      const data = await response.json();
      setJobs(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

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

      event.target.reset();
      fetchJobs();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setUploading(false);
    }
  };

  const getStatusClass = (status) => {
    return status.toLowerCase();
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Distributed Job Platform</h1>
          <p>Upload, process, and monitor your CSV jobs.</p>
        </div>

        <button className="refresh-button" onClick={fetchJobs}>
          Refresh
        </button>
      </header>

      <main className="container">
        <section className="upload-card">
          <h2>Upload CSV File</h2>
          <p className="description">
            Submit a CSV file for background processing.
          </p>

          <form onSubmit={handleUpload}>
            <input
              type="file"
              accept=".csv"
              onChange={(event) => setSelectedFile(event.target.files[0])}
            />

            <button type="submit" disabled={uploading}>
              {uploading ? "Uploading..." : "Submit Job"}
            </button>
          </form>

          {message && <p className="message">{message}</p>}
        </section>

        <section className="jobs-section">
          <div className="section-header">
            <h2>Job History</h2>
            <span>{jobs.length} jobs</span>
          </div>

          {loading ? (
            <p>Loading jobs...</p>
          ) : jobs.length === 0 ? (
            <div className="empty-state">
              <p>No jobs found. Upload a CSV file to get started.</p>
            </div>
          ) : (
            <div className="jobs-list">
              {jobs.map((job) => (
                <article className="job-card" key={job.id}>
                  <div className="job-header">
                    <div>
                      <h3>{job.filename}</h3>
                      <p className="job-id">{job.id}</p>
                    </div>

                    <span className={`status ${getStatusClass(job.status)}`}>
                      {job.status}
                    </span>
                  </div>

                  <div className="job-details">
                    <p>
                      <strong>Created:</strong>{" "}
                      {new Date(job.created_at).toLocaleString()}
                    </p>

                    {job.result && (
                      <div className="result">
                        <p>
                          <strong>Rows:</strong> {job.result.rows}
                        </p>

                        <p>
                          <strong>Columns:</strong> {job.result.columns}
                        </p>

                        <p>
                          <strong>File Size:</strong>{" "}
                          {job.result.file_size_bytes} bytes
                        </p>

                        <p>
                          <strong>Processing Time:</strong>{" "}
                          {job.result.processing_time_seconds} seconds
                        </p>
                      </div>
                    )}

                    {job.error && (
                      <p className="error">
                        <strong>Error:</strong> {job.error}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;