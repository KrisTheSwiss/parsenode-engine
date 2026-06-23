import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import WebSocket from 'ws';
import * as cheerio from 'cheerio';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials in .env');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    transport: WebSocket as any
  }
});

// Replaced mock with functional Cheerio extraction
function parseHtmlPayload(html: string) {
  console.log(`Parsing HTML payload (${html.length} bytes)...`);
  const $ = cheerio.load(html);
  
  const extracted = {
    title: $('title').text() || 'No title found',
    description: $('meta[name="description"]').attr('content') || 'No description found',
    content: $('body').text().replace(/\s+/g, ' ').trim() // Basic text cleanup
  };
  
  return extracted;
}

async function processIncomingRequest(apiKeyHash: string, htmlPayload: string) {
  console.log("--- Processing Request ---");

  const { data: authData, error: authError } = await supabase.rpc('authenticate_api_key', {
    p_key_hash: apiKeyHash
  });

  if (authError || !authData || authData.length === 0) {
    console.error("Authentication failed: Invalid or inactive API key.");
    if (authError) console.error("Auth DB Error:", authError.message);
    return;
  }

  const { wallet_address, balance } = authData[0];
  console.log(`Authenticated wallet: ${wallet_address} | Balance: ${balance}`);

  const executionCost = 1;
  if (balance < executionCost) {
    console.error("Request rejected: Insufficient balance.");
    return;
  }

  const extractedData = parseHtmlPayload(htmlPayload);

  const { data: debitSuccess, error: debitError } = await supabase.rpc('debit_wallet_balance', {
    p_wallet_address: wallet_address,
    p_amount: executionCost
  });

  if (debitError || !debitSuccess) {
    console.error("Transaction failed: Charge could not be processed.");
    if (debitError) console.error("Database Error Details:", debitError.message);
    return;
  }

  console.log(`Transaction successful. Remaining balance: ${balance - executionCost}`);
  console.log(`Result dispatched to client:`, extractedData);
}

// Updated mock HTML to test the parser
const mockHtml = `
  <html>
    <head>
      <title>ParseNode Target</title>
      <meta name="description" content="Agentic HTML extraction payload">
    </head>
    <body>
      <div id='target'>This is the core text data that the agent needs to read.</div>
    </body>
  </html>
`;

processIncomingRequest('dummy_hash_value_for_sk_test_123', mockHtml);