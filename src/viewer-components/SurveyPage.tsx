export function SurveyPage() {
    return (
        <div
            style={{
                flex: 1,
                padding: "2rem",
                overflowY: "auto",
                fontFamily: "Arial, sans-serif",
                backgroundColor: 'var(--background)',
                color: "#333",
            }}
            >
        {/* Header */}
        <header style={{ textAlign: "center", marginBottom: "2rem" }}>
            <h1 className="pages-header">Survey</h1>
        </header>

        <iframe
            src="https://docs.google.com/forms/d/e/1FAIpQLSdZfrK0O9zmeo4iJHlFNG4fNv9-aR_BtMC1uRmZbCprnTPj0Q/viewform?embedded=true"
            style={{
                width: "100%",
                minHeight: "90%",
                border: "none",
                backgroundColor: "none",
            }}
            >
                Loading ...
        </iframe>

        </div>
    );
}