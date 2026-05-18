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
        self.assertEqual(preview.extraction_source, "schema_org_jobposting")
        self.assertEqual(preview.quality_label, "strong")
        self.assertEqual(preview.quality_score, 10)

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
        self.assertEqual(preview.extraction_source, "page_text")
        self.assertIn(preview.quality_label, {"usable", "strong"})
        self.assertGreaterEqual(preview.quality_score, 4)

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

    def test_preview_rejects_page_shell_text_instead_of_jd(self) -> None:
        html = """
        <html>
          <head>
            <meta property="og:title" content="Systems Development Engineer">
            <meta property="og:site_name" content="LinkedIn">
          </head>
          <body>
            <main>
              Systems Development Engineer Amazon Web Services Sydney NSW.
              View job Save Apply Share Open app Similar jobs People also viewed.
              Company profile Privacy Policy Cookie Policy LinkedIn Corporation.
              https://www.linkedin.com/jobs/view/123/
            </main>
          </body>
        </html>
        """

        with self.assertRaises(JobUrlReadError):
            preview_from_html(html, "https://www.linkedin.com/jobs/view/123/")

    def test_preview_rejects_job_list_pages_instead_of_single_jd(self) -> None:
        html = """
        <html>
          <head>
            <meta property="og:title" content="Software Engineer jobs at Example">
            <meta property="og:site_name" content="LinkedIn">
          </head>
          <body>
            <main>
              Software Engineer jobs at Example. Jobs found. Create job alert.
              Backend Engineer View job Save job Apply now.
              Data Engineer View job Save job Apply now.
              Systems Engineer View job Save job Apply now.
              Recommended jobs People also viewed.
            </main>
          </body>
        </html>
        """

        with self.assertRaises(JobUrlReadError):
            preview_from_html(html, "https://www.linkedin.com/company/example/jobs/")

    def test_preview_requires_enough_information(self) -> None:
        with self.assertRaises(JobUrlReadError):
            preview_from_html("<html><title>x</title></html>", "https://example.com")


if __name__ == "__main__":
    unittest.main()
