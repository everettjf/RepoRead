import { useState, FormEvent } from "react";

interface UrlInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
  error?: string;
}

export function UrlInput({ onSubmit, isLoading, error }: UrlInputProps) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim() && !isLoading) {
      onSubmit(url.trim());
    }
  };

  return (
    <div className="url-input-container">
      <form onSubmit={handleSubmit} className="url-form">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          className="url-input"
          disabled={isLoading}
        />
        <button type="submit" className="url-submit" disabled={isLoading || !url.trim()}>
          {isLoading ? (
            <>
              <span className="spinner small"></span>
              Importing...
            </>
          ) : (
            "Open"
          )}
        </button>
      </form>
      {error && <div className="url-error">{error}</div>}
    </div>
  );
}
