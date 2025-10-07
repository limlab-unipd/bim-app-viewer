export function InfoPage() {
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

        <header style={{ textAlign: "center", marginBottom: "2rem" }}>
            <h1 className="pages-header">INFO</h1>
        </header>

        <section className="info-card">
            <h2 className="info-card-title">The project</h2>
            <p className="info-card-description">
                Coming soon ...
            </p>
        </section>

        <section className="info-card">
            <h2 className="info-card-title">About me</h2>
            <p className="info-card-description">
                Coming soon ...
            </p>
        </section>

        <section className="info-card">
            <h2 className="info-card-title">Experience</h2>
            <ul className="info-card-description">
            <li>
                <strong>Example: </strong>
                Coming soon ...
            </li>
            </ul>
        </section>

        <section className="info-card">
            <h2 className="info-card-title">Contacts</h2>
            <ul className="info-card-description">
            <li>
                <strong>Mail: </strong><a href="mailto:ygor.fasanella@phd.unipd.it">ygor.fasanella@phd.unipd.it</a>
            </li>
            <li>
                <a>Coming soon ...</a>
            </li>
            </ul>
        </section>

        </div>
    );
}
