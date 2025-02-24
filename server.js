const express = require('express')
const fs = require('fs').promises
const sqlite3 = require('sqlite3').verbose()

const app = express()
app.use(express.json())
app.use(express.static('public'))

const libraryDir = './library'

app.post('/generate', async (req, res) => {
	console.log('Received POST request:', req.body.request) // Debug log
	const request = req.body.request
	const { script, explanation } = await generateScript(request)
	sendEmail(script, explanation, request)
	saveLog(request, script)
	res.json({ script, explanation })
})

// Helper: Analyze intent from the prompt (simple keyword matching)
function analyzeIntent(request) {
	console.log('Analyzing request:', request) // Debug log

	if (
		request.includes('name') &&
		(request.includes('update') || request.includes('change'))
	) {
		return { type: 'name', action: 'update' }
	} else if (
		request.includes('phone') &&
		(request.includes('update') || request.includes('change'))
	) {
		return { type: 'phone', action: 'update' }
	} else if (
		request.includes('email') &&
		(request.includes('update') || request.includes('change'))
	) {
		return { type: 'email', action: 'update' }
	} else if (
		request.includes('status') &&
		(request.includes('update') || request.includes('change'))
	) {
		return { type: 'status', action: 'update' }
	} else if (request.includes('delete')) {
		return { type: 'delete', action: 'delete' }
	} else if (request.includes('insert')) {
		return { type: 'insert', action: 'insert' }
	}

	return null
}

// Helper: Clean the user request (simple sanitization)
function cleanRequest(request) {
	return request
		.toLowerCase()
		.replace(/'s\b|’s\b/g, '')
		.trim()
}

// Helper: Extract values from the prompt (simple splitting)
function extractValues(request, intent) {
	console.log('Extracting values for:', request) // Debug log
	const parts = request.split(' ')
	let currentValue = null,
		newValue = null,
		userId = null

	if (intent.type === 'name') {
		// Look for name before "name" and new value after "to"
		const nameIdx = parts.indexOf('name')
		if (nameIdx > 0) {
			currentValue =
				parts
					.slice(0, nameIdx)
					.join(' ')
					.replace(/(update|change)/, '')
					.trim() || null // Remove action word
		}
		const toIdx = parts.indexOf('to')
		if (toIdx > 0 && toIdx < parts.length - 1) {
			newValue =
				parts
					.slice(toIdx + 1)
					.join(' ')
					.trim() || null
		}
	} else if (
		intent.type === 'phone' ||
		intent.type === 'email' ||
		intent.type === 'status'
	) {
		// Look for name (if any) before the type and new value after "to"
		const toIdx = parts.indexOf('to')
		if (toIdx > 0) {
			const beforeTo = parts.slice(0, toIdx).join(' ').trim()
			currentValue =
				beforeTo
					.split(intent.type)[0]
					.replace(/(update|change)/, '')
					.trim() || null // Remove action word
			newValue =
				parts
					.slice(toIdx + 1)
					.join(' ')
					.trim() || null
		}
	} else if (intent.type === 'delete') {
		currentValue = request.split('delete')[1].trim() || null
	} else if (intent.type === 'insert') {
		newValue = request.split('insert')[1].trim() || null
	}

	// Look for user ID (e.g., "for user 123")
	const userIdx = request.indexOf('for user')
	if (userIdx !== -1) userId = request.split('for user')[1].trim() || null

	return { currentValue, newValue, userId }
}

// Helper: Build a dynamic, safe script with transactions and SELECTs
function buildDynamicScript(template, type, values) {
	console.log('Template before update:', template) // Debug log
	console.log('Values for update:', values) // Debug log

	// Parse the script to extract table, column(s), and WHERE clause
	const tablePattern = /\b(update|insert|delete)\s+([^\s]+)\s+/i
	const setPattern = /\bset\s+([^;]+?)(?=where|\s*;)/i
	const wherePattern = /\bwhere\s+([^=]+)=(.+?)(?=\s*(?:;|$))/i // Match WHERE column and value

	const tableMatch = template.match(tablePattern)
	const table = tableMatch ? tableMatch[2] : 'users' // Default to 'users' for now

	const setMatch = template.match(setPattern)
	let columns = []
	if (setMatch) {
		columns = setMatch[1]
			.split(',')
			.map((clause) => clause.trim().split('=')[0].trim().toLowerCase())
	}
	const column = columns[0] || type // Use first column or fall back to type (e.g., 'name' → 'last_name')

	const whereMatch = template.match(wherePattern)
	let whereColumn = 'user_id' // Default to user_id since template indicates it exists
	let whereClause = whereMatch
		? `${whereColumn} = <USER_ID_HERE>`
		: 'user_id = <USER_ID_HERE>'

	// Adjust WHERE clause to use user_id placeholder
	if (values.userId) {
		whereClause = `${whereColumn} = ${values.userId}`
	}

	// Build update part with dynamic replacement
	let updatePart = template
	if (setMatch) {
		// For name updates, update last_name by default (clean replacement)
		if (type === 'name') {
			updatePart = template.replace(
				new RegExp(`last_name\\s*=\\s*['"]?[^'"]*['"]?`, 'i'),
				`last_name = '${values.newValue || ''}'`
			)
		} else {
			updatePart = template.replace(
				new RegExp(`${column}\\s*=\\s*['"]?[^'"]*['"]?`, 'i'),
				`${column} = '${values.newValue || ''}'`
			)
		}
	} else if (type === 'delete') {
		updatePart = template.replace(
			/where\s+(.+?)(?=\s*;|$)/i,
			`WHERE ${whereClause}`
		)
	} else if (type === 'insert') {
		updatePart = template.replace(
			/values\s*\(([^)]+)\)/i,
			`VALUES (${values.newValue || 'default'})`
		)
	}

	updatePart = updatePart
		.replace(/user_id = \d+/, whereClause) // Adjust WHERE clause to use user_id and placeholder
		.replace(/;;/g, ';')
		.replace(/\s*;\s*$/, ';')

	// Build SELECT statements to help find the user_id
	let selectBefore, selectAfter
	if (type === 'name') {
		selectBefore = `SELECT user_id, first_name, last_name FROM ${table} WHERE CONCAT(first_name, ' ', last_name) LIKE '%${values.currentValue}%';`
		selectAfter = `SELECT user_id, first_name, last_name FROM ${table} WHERE CONCAT(first_name, ' ', last_name) LIKE '%${values.newValue}%';`
	} else {
		selectBefore = `SELECT user_id, ${column} FROM ${table} WHERE ${
			whereClause === 'user_id = <USER_ID_HERE>' ? '1=1' : whereClause
		};`
		selectAfter = `SELECT user_id, ${column} FROM ${table} WHERE ${
			whereClause === 'user_id = <USER_ID_HERE>' ? '1=1' : whereClause
		};`
	}

	console.log('Update part:', updatePart) // Debug log

	// Format script with newline before BEGIN TRANSACTION, preserve leading newline
	return `\nBEGIN TRANSACTION;\n${selectBefore}\n${updatePart}\n--COMMIT;\n--ROLLBACK;`
}

async function generateScript(request) {
	const cleanedRequest = cleanRequest(request)
	console.log('Cleaned Request:', cleanedRequest) // Debug log (once)

	const files = await fs.readdir(libraryDir)
	const library = await Promise.all(
		files.map((f) => fs.readFile(`${libraryDir}/${f}`, 'utf8'))
	)

	// Simple intent detection by keywords
	const intent = analyzeIntent(cleanedRequest)
	if (!intent) {
		return {
			script: '/* No match found */',
			explanation: 'Couldn’t determine the update type from the request',
		}
	}

	// Find a matching script based on intent (once)
	const matchingScript = findMatchingScript(library, intent.type)
	console.log('Library Script Chosen:', matchingScript || 'None found') // Debug log (once)
	if (!matchingScript) {
		return {
			script: '/* No match found */',
			explanation: `Couldn’t find a matching script for ${intent.type} updates in the library`,
		}
	}

	// Extract values from the prompt
	const values = extractValues(cleanedRequest, intent)
	console.log('Extracted Values:', values) // Debug log
	if (!values || !values.newValue || !values.currentValue) {
		return {
			script: '/* No match found */',
			explanation: `Couldn’t parse values for ${intent.type} update from the request`,
		}
	}

	// Build the safe script using the template and prompt values
	const script = buildDynamicScript(matchingScript, intent.type, values)
	const explanation = `Updates ${intent.type} for a user (review SELECT results before uncommenting COMMIT)`

	console.log('Generated Script:', script) // Debug log
	console.log('Explanation:', explanation) // Debug log

	return { script, explanation }
}

// Helper: Find a matching script in the library based on intent
function findMatchingScript(library, type) {
	console.log('Searching for matching script for type:', type) // Debug log (once)
	const matchedScript = library.find((script) => {
		const lowerScript = script.toLowerCase()
		switch (type) {
			case 'name':
				return (
					lowerScript.includes('name') &&
					(lowerScript.includes('set') || lowerScript.includes('update'))
				)
			case 'phone':
				return (
					lowerScript.includes('phone') &&
					(lowerScript.includes('set') || lowerScript.includes('update'))
				)
			case 'email':
				return (
					lowerScript.includes('email') &&
					(lowerScript.includes('set') || lowerScript.includes('update'))
				)
			case 'status':
				return (
					lowerScript.includes('status') &&
					(lowerScript.includes('set') || lowerScript.includes('update'))
				)
			case 'delete':
				return lowerScript.includes('delete')
			case 'insert':
				return lowerScript.includes('insert')
			default:
				return false
		}
	})
	return matchedScript // Remove console.log('Library Script Chosen: ...') here—moved to generateScript
}

// Simulate email by logging to console
function sendEmail(script, explanation, request) {
	console.log('Simulated Email:')
	console.log('To: dev@example.com')
	console.log('Subject: New SQL Request - ' + new Date().toLocaleDateString())
	console.log('Body:')
	console.log(`Request: ${request}`)
	console.log(`Script: ${script}`)
	console.log(`Explanation: ${explanation}`)
}

const db = new sqlite3.Database('logs.db')
db.run(
	'CREATE TABLE IF NOT EXISTS logs (date TEXT, user TEXT, request TEXT, script TEXT)'
)
function saveLog(request, script) {
	db.run('INSERT INTO logs (date, user, request, script) VALUES (?, ?, ?, ?)', [
		new Date().toISOString(),
		'jdoe',
		request,
		script,
	])
}

app.listen(3000, () => console.log('Server running on port 3000'))
