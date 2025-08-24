# fgalgo

[日本語版はこちら (Japanese Version)](./README.ja.md)

fgalgo is a Node.js tool that automatically generates OpenFGA Authorization Models and Relationship Tuples. It reads user attributes and device information from Excel files and Matter specification XML files, then generates Authorization Models and Relationship Tuples compatible with OpenFGA.

## Key Features

- Automatic import of user and device information from Excel files
- Parsing Matter specification XML files to generate device types and command sets
- Automatic generation of Authorization Models (.fga)
- Automatic generation of Relationship Tuples
- Automatic deployment to OpenFGA server
- Interactive device permission configuration

## Requirements

- Node.js (v18 or higher recommended)
- python3
- OpenFGA CLI (`fga` command)
- OpenFGA server

## Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd fgalgo
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy `.env.sample` to create a `.env` file and configure OpenFGA connection settings:

```bash
cp .env.sample .env
```

Edit the `.env` file:

```env
FGA_API_URL=your-openfga-api-url
FGA_STORE_ID=your-store-id
FGA_API_TOKEN=your-api-token
```

### 4. Prepare Input Files

Place the following files in the appropriate directories:

#### Device-related
- `matter_xml/` - Matter specification XML files

## Usage

### Basic Execution

```bash
node main.js
```

### Execution Flow

1. **User Information Processing**
   - Load user groups and user attributes from Excel files
   - Generate Authorization Model for users
   - Generate Relationship Tuples for users

2. **Device Information Processing**
   - Load Matter device types from JSON
   - Load device attributes from Excel
   - Interactive device configuration (permissions, actions)
   - Generate Authorization Model for devices
   - Generate Relationship Tuples for devices

3. **Deploy to OpenFGA**
   - Send integrated Authorization Model to OpenFGA server
   - Upload all Relationship Tuples

## Project Structure

```
fgalgo/
├── main.js                 # Main entry point
├── package.json           
├── .env                   # Environment variables
├── src/                   # Source code
│   ├── user/             # User-related processing
│   ├── device/           # Device-related processing
│   ├── export/           # FGA export processing
│   └── util/             # Utility functions
├── file/                 # Input and template files
│   ├── template/         # EJS templates
│   ├── model/            # FGA model files
│   └── json/             # JSON data files
├── matter_xml/           # Matter specification XML files
└── python/               # Python auxiliary scripts
```

## Configuration File Formats

### User Groups (user_groups.xlsx)
#### Format
| No. | Field | Description | Type |
|-----|-------|-------------|------|
| 1 | id | ID | int |
| 2 | uid | Unique group ID | string |
| 3 | name | Human-readable name | string |
| 4 | parent | Parent hierarchy group name | string / null |

#### Example
|id| uid | name | parent |
|--|-----|------|-------|
|1| teacher | Teacher Group |  |
|2| doctor | PhD Student Group | teacher |

### User Attributes (user_attributes.xlsx)
#### Format
| No. | Field | Description | Type |
|-----|-------|-------------|------|
| 1 | id | ID | int |
| 2 | uid | Unique user ID | string |
| 3 | name | Human-readable name | string |
| 4 | group | Affiliated groups | array of string / null |
| 5 | room | Affiliated rooms | array of string / null |

#### Example
|id | uid | name | group | room |
|---|-----|------|-------|------|
| 1 | tanaka | Taro Tanaka | teacher | room101, room102 |
| 2 | sato | Hanako Sato | doctor | room102 |

### Device Attributes (device_attributes.xlsx)
#### Format
| No. | Field | Description | Type |
|-----|-------|-------------|------|
| 1 | id | ID | int |
| 2 | uid | Unique device ID | string |
| 3 | name | Human-readable name | string |
| 4 | type | Device type | string |
| 5 | room | Affiliated rooms | array of string / null |

#### Example
| uid | name | type | room |
|-----|------|------|----------|
| light101 | Room 101 Light | onofflightswitch | room101 |
| lock102 | Room 102 Smart Lock | doorlock | room102 |

## Dependencies

- **@openfga/sdk** - OpenFGA SDK
- **exceljs** - Excel file processing
- **xml2js** - XML parsing
- **ejs** - Template engine
- **inquirer** - Interactive CLI
- **dotenv** - Environment variable management

## Development

### Python Scripts

Generate device type JSON from Matter XML specification files:

```bash
cd python
python parse-matter-devices-xml-to-json.py
```
Saved to `file/json/matter`
