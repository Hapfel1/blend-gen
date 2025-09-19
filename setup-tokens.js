import { getAuthURL, getTokenFromCode, getUserInfo } from './auth.js';
import readline from 'readline';
import fs from 'fs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function setupTokens() {
  console.log('Setting up Spotify tokens for your blend generator\n');
  
  // User 1
  console.log('User 1 Authentication:');
  console.log('1. Open this URL in your browser:');
  console.log(getAuthURL());
  console.log('\n2. After authorizing, copy the "code" parameter from the redirect URL');
  
  const code1 = await askQuestion('Enter the code for User 1: ');
  
  try {
    const tokens1 = await getTokenFromCode(code1);
    const user1 = await getUserInfo(tokens1.accessToken);
    console.log(`User 1 authenticated: ${user1.display_name}\n`);
    
    // User 2
  console.log('User 2 Authentication:');
    console.log('1. Open this URL in your browser (preferably in an incognito/private window):');
    console.log(getAuthURL());
    console.log('\n2. After authorizing, copy the "code" parameter from the redirect URL');
    
    const code2 = await askQuestion('Enter the code for User 2: ');
    
    const tokens2 = await getTokenFromCode(code2);
    const user2 = await getUserInfo(tokens2.accessToken);
    console.log(`User 2 authenticated: ${user2.display_name}\n`);
    
    // Update .env file
    let envContent = fs.readFileSync('.env', 'utf8');
    envContent = envContent.replace(/USER1_TOKEN=.*/, `USER1_TOKEN=${tokens1.accessToken}`);
    envContent = envContent.replace(/USER2_TOKEN=.*/, `USER2_TOKEN=${tokens2.accessToken}`);
    
    // Add user info as comments
    envContent += `\n# User 1: ${user1.display_name} (${user1.id})`;
    envContent += `\n# User 2: ${user2.display_name} (${user2.id})`;
    
    fs.writeFileSync('.env', envContent);
    
  console.log('Setup complete! Your tokens have been saved to .env');
    console.log('Now you can run: npm run blend');
    
  } catch (error) {
    console.error('Error during setup:', error.message);
    console.log('\nTips:');
    console.log('- Make sure you copied the entire code parameter');
    console.log('- Check that your Client ID and Secret are correct in .env');
  console.log('- Make sure the redirect URI is set to https://hapfel.org/callback in your Spotify app');
  }
  
  rl.close();
}

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

setupTokens();