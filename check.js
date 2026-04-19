const fs = require('fs');

function checkFile(path) {
  let content = fs.readFileSync(path, 'utf8');
  let lines = content.split('\n');
  console.log('--- ' + path + ' ---');
  let hasMisses = false;
  for(let i=0; i<lines.length; i++) {
    const line = lines[i];
    // Check if it has className="something"
    if (line.match(/className="[^"]+"/)) {
      console.log(`Hardcoded string at line ${i+1}: ${line.trim()}`);
      hasMisses = true;
    }
  }
  if (!hasMisses) console.log('No hardcoded className="..." found.');
}

checkFile('frontend/src/App.jsx');
checkFile('frontend/src/Dashboard.jsx');
checkFile('frontend/src/ApplicantStatus.jsx');
