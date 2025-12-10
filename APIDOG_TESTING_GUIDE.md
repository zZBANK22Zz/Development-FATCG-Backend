# APIdog Testing Guide for CCTM API

## Prerequisites
- Server running on `http://localhost:8000`
- APIdog (or similar API testing tool) installed

---

## Step 1: Store Existing Tree (for merge testing)

**Endpoint:** `POST http://localhost:8000/api/cctm/store-existing`

**Purpose:** Store an existing classification tree that will be merged with incoming trees.

### APIdog Setup:
1. **Method:** POST
2. **URL:** `http://localhost:8000/api/cctm/store-existing`
3. **Headers:**
   - No special headers needed (Content-Type will be set automatically for multipart/form-data)

4. **Body Type:** `form-data` or `multipart/form-data`
5. **Body Parameters:**
   - Key: `file`
   - Type: `File`
   - Value: Select your XML file (e.g., `base_tree.xml`)

### Example Request:
```
POST http://localhost:8000/api/cctm/store-existing
Content-Type: multipart/form-data

file: [Select base_tree.xml file]
```

### Expected Response:
```json
{
  "success": true,
  "message": "stored",
  "path": "/path/to/uploads/existing_tree.xml"
}
```

---

## Step 2: Upload New Tree and Generate Test Cases

**Endpoint:** `POST http://localhost:8000/api/cctm/upload`

**Purpose:** Upload a new classification tree XML file. If an existing tree is stored (from Step 1), it will be merged with this new tree. Then generate test cases.

### APIdog Setup:
1. **Method:** POST
2. **URL:** `http://localhost:8000/api/cctm/upload`
3. **Headers:**
   - No special headers needed (Content-Type will be set automatically)

4. **Body Type:** `form-data` or `multipart/form-data`
5. **Body Parameters:**
   - Key: `file`
     - Type: `File`
     - Value: Select your XML file (e.g., `new_tree.xml`)
   - Key: `threshold` (optional)
     - Type: `Text`
     - Value: `10000` (default) - Maximum number of test cases to generate

### Example Request:
```
POST http://localhost:8000/api/cctm/upload
Content-Type: multipart/form-data

file: [Select new_tree.xml file]
threshold: 10000
```

### Expected Response:
```json
{
  "success": true,
  "variables": [
    {
      "name": "age",
      "type": "number",
      "terminalClasses": [
        {
          "id": "seg-0-12",
          "label": "0-12",
          "min": 0,
          "max": 12,
          "valid": true
        },
        {
          "id": "seg-12-13",
          "label": "12-13",
          "min": 12,
          "max": 13,
          "valid": true
        }
        // ... more merged segments
      ]
    }
    // ... more variables
  ],
  "partitions": [...],
  "testCases": [...],
  "warnings": [],
  "stats": {
    "total": 10
  }
}
```

---

## Testing Merge Functionality

### Complete Test Flow:

1. **First Request - Store Base Tree:**
   - Upload `base_tree.xml` to `/api/cctm/store-existing`
   - This tree has age ranges: 0-12, 13-19, 20-120

2. **Second Request - Upload New Tree (will merge):**
   - Upload `new_tree.xml` to `/api/cctm/upload`
   - This tree has age ranges: 0-17, 18-64, 65-120
   - **Expected:** The response should show merged segments like:
     - 0-12 (from base)
     - 12-13 (overlap)
     - 13-17 (from new)
     - 17-18 (overlap)
     - 18-19 (overlap)
     - 19-20 (gap)
     - 20-64 (overlap)
     - 64-65 (gap)
     - 65-120 (from both)

---

## Real Example: With Merge vs Without Merge

This section demonstrates the actual differences in API responses when merging classification trees versus processing a single tree.

### Scenario Setup

**Base Tree (base_tree.xml):**
- `age`: 0-12 (valid), 13-19 (valid), 20-120 (valid)
- `membershipType`: Free, Silver

**New Tree (new_tree.xml):**
- `age`: 0-17 (valid), 18-64 (valid), 65-120 (valid), -999--1 (invalid)
- `membershipType`: Gold, Platinum
- `email`: 0-0 (invalid)

---

### 📊 Test Case 1: WITHOUT Merge

**Steps:**
1. **Skip** Step 1 (do NOT store existing tree)
2. Upload `new_tree.xml` directly to `/api/cctm/upload`

**Result:** Only the new tree is processed (no merge occurs)

#### Age Variable (Numeric)
```json
{
  "name": "age",
  "type": "number",
  "terminalClasses": [
    {
      "id": "age-range-0",
      "label": "0-17",
      "min": 0,
      "max": 17,
      "valid": true
    },
    {
      "id": "age-range-1",
      "label": "18-64",
      "min": 18,
      "max": 64,
      "valid": true
    },
    {
      "id": "age-range-2",
      "label": "65-120",
      "min": 65,
      "max": 120,
      "valid": true
    },
    {
      "id": "age-range-3",
      "label": "-999--1",
      "min": -999,
      "max": -1,
      "valid": false
    }
  ]
}
```

**Summary:**
- ✅ **4 terminal classes** (original ranges from new_tree.xml)
- ✅ Simple, straightforward ranges
- ❌ No merge happened - missing ranges from base tree (0-12, 13-19)

#### MembershipType Variable (Enum)
```json
{
  "name": "membershipType",
  "type": "enum",
  "terminalClasses": [
    {
      "id": "membershipType-enum-0",
      "label": "membershipType=Gold",
      "values": ["Gold"],
      "valid": true
    },
    {
      "id": "membershipType-enum-1",
      "label": "membershipType=Platinum",
      "values": ["Platinum"],
      "valid": true
    },
    {
      "id": "membershipType-enum-invalid",
      "label": "membershipType=other",
      "values": [],
      "valid": false
    }
  ]
}
```

**Summary:**
- ✅ **3 terminal classes** (only Gold, Platinum from new_tree.xml)
- ❌ Missing: Free, Silver (from base tree)

---

### 🔀 Test Case 2: WITH Merge

**Steps:**
1. Upload `base_tree.xml` to `/api/cctm/store-existing`
2. Upload `new_tree.xml` to `/api/cctm/upload`

**Result:** Both trees are merged together

#### Age Variable (Numeric - Merged)
```json
{
  "name": "age",
  "type": "number",
  "terminalClasses": [
    {
      "id": "merged-0-0-120",
      "label": "0-120",
      "min": 0,
      "max": 120,
      "valid": true
    },
    {
      "id": "merged-invalid-0--999--1",
      "label": "-999--1",
      "min": -999,
      "max": -1,
      "valid": false
    }
  ]
}
```

**Summary:**
- ✅ **2 terminal classes** (reduced from 7 total ranges: 3 from base + 4 from new)
- ✅ **Overlapping ranges are combined**: 
  - Base tree ranges: 0-12, 13-19, 20-120
  - New tree ranges: 0-17, 18-64, 65-120
  - All these overlap and form a continuous range → merged into **0-120**
- ✅ **Reduction example**: 0-12 (base) + 0-17 (new) → **0-17** (reduced from 2 classes to 1)
- ✅ Validity: merged range is valid if **at least one** overlapping range is valid
- ✅ Invalid ranges are merged separately (e.g., -999--1 remains as invalid range)

#### MembershipType Variable (Enum - Merged)
```json
{
  "name": "membershipType",
  "type": "enum",
  "terminalClasses": [
    {
      "id": "membershipType-enum-0",
      "label": "membershipType=Free",
      "values": ["Free"],
      "valid": true
    },
    {
      "id": "membershipType-enum-1",
      "label": "membershipType=Silver",
      "values": ["Silver"],
      "valid": true
    },
    {
      "id": "membershipType-enum-2",
      "label": "membershipType=Gold",
      "values": ["Gold"],
      "valid": true
    },
    {
      "id": "membershipType-enum-3",
      "label": "membershipType=Platinum",
      "values": ["Platinum"],
      "valid": true
    },
    {
      "id": "membershipType-enum-invalid",
      "label": "membershipType=other",
      "values": [],
      "valid": false
    }
  ]
}
```

**Summary:**
- ✅ **5 terminal classes** (union of all enum values from both trees)
- ✅ All values included: Free, Silver (from base) + Gold, Platinum (from new)
- ✅ Unique IDs generated for merged enums
- ✅ Single invalid/other class (deduplicated)

---

### 📈 Key Differences Summary

| Aspect | WITHOUT Merge | WITH Merge |
|--------|---------------|------------|
| **Age Terminal Classes** | 4 simple ranges | **2 merged ranges** (reduced from 7 total) |
| **Age Coverage** | Only new tree ranges | Combined ranges from both trees |
| **Age Range Example** | 0-17, 18-64, 65-120 | **0-120** (all valid ranges merged) |
| **MembershipType Values** | 3 values (Gold, Platinum, other) | 5 values (Free, Silver, Gold, Platinum, other) |
| **Test Cases Generated** | ~15 test cases | ~10-15 test cases (fewer due to reduced classes) |
| **ID Format** | `age-range-*` | `merged-*` (merged ranges) |
| **Class Reduction** | No reduction | **Reduces overlapping classes** into larger ranges |

### 🎯 When to Use Each Approach

**Use WITHOUT Merge:**
- Initial tree creation
- Testing a single classification tree
- Quick prototyping
- When you don't need historical data

**Use WITH Merge:**
- Incremental tree updates
- Combining multiple test perspectives
- Building comprehensive test coverage
- Preserving existing classification data
- Following the merging algorithm from the research paper

### 💡 Merge Algorithm Insights

The merge algorithm **REDUCES** the number of terminal classes by combining overlapping ranges:

1. **Combines overlapping ranges**: When ranges overlap, they merge into a single larger range
   - Example: `0-12` + `0-17` → `0-17` (reduced from 2 classes to 1)
   - Example: `0-12`, `13-19`, `20-120`, `0-17`, `18-64`, `65-120` → `0-120` (reduced from 6 classes to 1)

2. **Determines validity**: Merged range is valid if at least one overlapping range is valid

3. **Separates valid/invalid**: Valid and invalid ranges are merged separately

4. **Handles enums**: Takes the union of all enum values (combines different enum values from both trees)

5. **Generates unique IDs**: Creates new IDs for merged ranges

**Key Benefit**: This reduces the classification tree size by eliminating redundant overlapping ranges, making the tree more efficient while preserving all coverage from both trees.

---

## APIdog Screenshots Guide

### For `/store-existing` endpoint:
1. Create a new request
2. Set method to `POST`
3. Enter URL: `http://localhost:8000/api/cctm/store-existing`
4. Go to **Body** tab
5. Select **form-data** or **File**
6. Add field:
   - Key: `file`
   - Type: Click dropdown and select **File**
   - Click **Select File** and choose your XML file
7. Click **Send**

### For `/upload` endpoint:
1. Create a new request
2. Set method to `POST`
3. Enter URL: `http://localhost:8000/api/cctm/upload`
4. Go to **Body** tab
5. Select **form-data**
6. Add fields:
   - Field 1:
     - Key: `file`
     - Type: Select **File**
     - Value: Click **Select File** and choose your XML file
   - Field 2:
     - Key: `threshold`
     - Type: **Text**
     - Value: `10000`
7. Click **Send**

---

## Troubleshooting

### Error: "No file uploaded"
- Make sure you're using `form-data` body type
- Verify the field name is exactly `file`
- Ensure you've actually selected a file

### Error: "Failed to parse or merge existing stored tree"
- Check that your XML file is valid
- Verify the XML structure matches the expected format
- Check server logs for more details

### No merge happening
- Verify that `existing_tree.xml` exists in the `uploads/` folder
- Make sure you called `/store-existing` before `/upload`
- Check that both trees have variables with the same name (e.g., "age")

---

## Sample XML Files

### base_tree.xml (for store-existing):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<DataDictionary>
  <Variable>
    <Name>age</Name>
    <Type>number</Type>
    <Range valid="true">
      <Min>0</Min>
      <Max>12</Max>
    </Range>
    <Range valid="true">
      <Min>13</Min>
      <Max>19</Max>
    </Range>
    <Range valid="true">
      <Min>20</Min>
      <Max>120</Max>
    </Range>
  </Variable>
  <Variable>
    <Name>membershipType</Name>
    <Type>enum</Type>
    <Enum>
      <Value>Free</Value>
      <Value>Silver</Value>
    </Enum>
  </Variable>
</DataDictionary>
```

### new_tree.xml (for upload):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<DataDictionary>
  <Variable>
    <Name>age</Name>
    <Type>number</Type>
    <Range valid="true">
      <Min>0</Min>
      <Max>17</Max>
    </Range>
    <Range valid="true">
      <Min>18</Min>
      <Max>64</Max>
    </Range>
    <Range valid="true">
      <Min>65</Min>
      <Max>120</Max>
    </Range>
    <Range valid="false">
      <Min>-999</Min>
      <Max>-1</Max>
    </Range>
  </Variable>
  <Variable>
    <Name>membershipType</Name>
    <Type>enum</Type>
    <Enum>
      <Value>Gold</Value>
      <Value>Platinum</Value>
    </Enum>
  </Variable>
</DataDictionary>
```

