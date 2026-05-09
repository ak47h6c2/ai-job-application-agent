import unittest

from backend.app.services.job_url_reader import JobUrlReadError, preview_from_html, validate_public_http_url


class JobUrlReaderTests(unittest.TestCase):
    def test_preview_from_json_ld_jobposting(self) -> None:
        html = """
        <html>
          <head>
            <title>Fallback title</title>
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "JobPosting",
              "title": "Graduate Software Engineer",
              "hiringOrganization": {"@type": "Organization", "name": "Example AU"},
              "jobLocation": {
                "@type": "Place",
                "address": {
                  "@type": "PostalAddress",
                  "addressLocality": "Sydney",
                  "addressRegion": "NSW",
                  "addressCountry": "Australia"
                }
              },
              "description": "<p>Build Python services, work with SQL databases, and test APIs.</p>"
            }
            </script>
          </head>
          <body>Decorative page text</body>
        </html>
        """

        preview = preview_from_html(html, "https://example.com/jobs/1")

        self.assertEqual(preview.title, "Graduate Software Engineer")
        self.assertEqual(preview.company, "Example AU")
        self.assertEqual(preview.location, "Sydney, NSW, Australia")
        self.assertIn("Python services", preview.description)
        self.assertEqual(preview.url, "https://example.com/jobs/1")

    def test_preview_falls_back_to_meta_and_visible_text(self) -> None:
        html = """
        <html>
          <head>
            <meta property="og:title" content="Data Analyst Intern">
            <meta property="og:site_name" content="Example Careers">
            <meta name="description" content="Internship using SQL, Python, dashboards, and stakeholder reporting.">
          </head>
          <body>
            <main>
              <h1>Data Analyst Intern</h1>
              <p>Responsibilities include SQL analysis, Python automation, and reporting.</p>
            </main>
          </body>
        </html>
        """

        preview = preview_from_html(html, "https://careers.example.com/job")

        self.assertEqual(preview.title, "Data Analyst Intern")
        self.assertEqual(preview.company, "Example Careers")
        self.assertIn("SQL", preview.description)

    def test_validate_public_http_url_rejects_local_links(self) -> None:
        with self.assertRaises(ValueError):
            validate_public_http_url("http://127.0.0.1:5173/job")

    def test_preview_rejects_login_page_instead_of_treating_as_job(self) -> None:
        html = """
        <html>
          <head>
            <title>LinkedIn Login, Sign in | LinkedIn</title>
            <meta name="description" content="Login to LinkedIn to keep in touch with people you know.">
          </head>
          <body>Sign in to access this page.</body>
        </html>
        """

        with self.assertRaises(JobUrlReadError):
            preview_from_html(html, "https://www.linkedin.com/comm/jobs/view/123/")

    def test_preview_requires_enough_information(self) -> None:
        with self.assertRaises(JobUrlReadError):
            preview_from_html("<html><title>x</title></html>", "https://example.com")


if __name__ == "__main__":
    unittest.main()
