import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to extract the attendance block
attendance_pattern = re.compile(r'(\s*const \[attendanceRecords.*?const currentAttendance = [^\n]*;\n)', re.DOTALL)
match = attendance_pattern.search(content)

if match:
    attendance_block = match.group(1)
    
    # Remove from original location
    content = content.replace(attendance_block, '')
    
    # Find insertion point: after `const [currentUser, setCurrentUser] = ... }`
    # I'll just find `const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');` which is somewhere near.
    
    # Let's insert it before `const activeBranchId = currentUser?.role` or `// Global Context Data`
    # Let's look for `  // Auth & Role Handlers` or `const activeBranchId`
    
    insertion_anchor = "const activeBranchId ="
    if insertion_anchor in content:
        content = content.replace(insertion_anchor, attendance_block + "\n  " + insertion_anchor)
    else:
        print("Anchor not found")
        
    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Fixed order.")
else:
    print("Attendance block not found.")
