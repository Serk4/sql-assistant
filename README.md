# SQL Assistant

A Node.js-based tool that automates repetitive database tasks by generating efficient SQL scripts, saving time for developers and data professionals.

## Current Features

- Automatically generates SQL scripts for routine database queries
- Handles large datasets with optimized performance
- Provides a simple web interface for script management via the `public/` folder
- Includes a customizable `library/` for SQL utilities and scripts

## Setup

1. Clone the repo: `git clone https://github.com/Serk4/sql-assistant.git`
2. Install dependencies: `npm install`
3. Run: `node server.js`

## Tech Stack

- Node.js
- JavaScript (Express for backend, vanilla JS for frontend)
- SQLite (for logging and potential script metadata)

## How It Works

The `server.js` backend uses Node.js and Express to parse user input and generate optimized SQL queries (e.g., INSERT, UPDATE, SELECT) based on dataset size and query patterns. The `public/` folder hosts a web UI where users can input parameters to generate scripts and manage their SQL library. The `library/` folder contains custom SQL utilities, with plans to expand its functionality.

## Upcoming Enhancements

- **Script Import Feature**: A frontend feature to allow users to import custom `.sql` scripts, building a personal script library. The storage method (e.g., files in `library/`, a single `library/custom.sql`, or a database like `logs.db`) and support for different SQL dialects (e.g., PostgreSQL, MySQL) are under development.
- **AI Integration**: Leverage natural language processing (NLP) to interpret user inputs, enabling intelligent SQL script generation from prompts or requests.
- **Database Connection Strings**: Add support for user-provided database connection strings to read database schemas, facilitating intelligent, schema-aware scripting based on user needs.

## Future Improvements

- Refine `library/` structure for dynamic script management
- Enhance script parsing to validate and adapt to various SQL dialects
- Integrate real-time feedback for script optimization and error handling
- Expand AI capabilities for advanced query suggestion and automation

## Contributing

Feel free to fork, star, or open issues for feature requests. Pull requests welcome!
