import pytest
from selenium import webdriver

@pytest.fixture
def driver():
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--allow-file-access-from-files')
    options.add_argument('--disable-web-security')
    driver = webdriver.Chrome(options=options)
    yield driver
    driver.quit()
