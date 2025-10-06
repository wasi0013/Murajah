# Selenium UI Tests for Murajah

## Structure
- `conftest.py`: Pytest fixtures for Selenium WebDriver setup/teardown
- `pages/`: Page Object Model classes (e.g., `QuranPage`)
- `ui/`: UI test scripts (e.g., `test_page_load.py`)

## Running Tests

1. Install dependencies:
   ```sh
   pip install selenium pytest
   ```
2. Download ChromeDriver and ensure it is in your PATH.
3. Run tests:
   ```sh
   pytest tests/ui/
   ```
