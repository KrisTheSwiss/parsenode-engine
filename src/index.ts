import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import WebSocket from 'ws';
import * as cheerio from 'cheerio';
import express, { Request, Response } from 'express';

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

const app = express();
// Increase payload limit for large DOM structures
app.use(express.json({ limit: '10mb' }));

function parseHtmlPayload(html: string) {
  console.log(`Parsing HTML payload (${html.length} bytes)...`);
  const $ = cheerio.load(html);
  
  return {
    title: $('title').text() || 'No title found',
    description: $('meta[name="description"]').attr('content') || 'No description found',
    content: $('body').text().replace(/\s+/g, ' ').trim()
  };
}

app.post('/api/parse', async (req: Request, res: Response): Promise<void> => {
  console.log("--- Incoming API Request ---");

  // Extract key from "Authorization: Bearer <key>"
  const apiKeyHash = req.headers.authorization?.replace('Bearer ', '');
  const htmlPayload = req.body.html;

  if (!apiKeyHash) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  if (!htmlPayload) {
    res.status(400).json({ error: "Missing 'html' field in JSON body" });
    return;
  }

  const { data: authData, error: authError } = await supabase.rpc('authenticate_api_key', {
    p_key_hash: apiKeyHash
  });

  if (authError || !authData || authData.length === 0) {
    console.error("Auth failed:", authError?.message || "Invalid key");
    res.status(401).json({ error: "Invalid or inactive API key." });
    return;
  }

  const { wallet_address, balance } = authData[0];
  console.log(`Authenticated wallet: ${wallet_address} | Balance: ${balance}`);

  const executionCost = 1;
  if (balance < executionCost) {
    console.error("Rejected: Insufficient balance.");
    res.status(402).json({ error: "Insufficient balance." });
    return;
  }

  const extractedData = parseHtmlPayload(htmlPayload);

  const { data: debitSuccess, error: debitError } = await supabase.rpc('debit_wallet_balance', {
    p_wallet_address: wallet_address,
    p_amount: executionCost
  });

  if (debitError || !debitSuccess) {
    console.error("DB Error:", debitError?.message);
    res.status(500).json({ error: "Transaction failed. Charge could not be processed." });
    return;
  }

  console.log(`Transaction successful. Remaining balance: ${balance - executionCost}`);
  
  res.status(200).json({
    success: true,
    data: extractedData,
    billing: {
      cost: executionCost,
      remaining_balance: balance - executionCost
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ParseNode Gateway actively listening on port ${PORT}`);
});