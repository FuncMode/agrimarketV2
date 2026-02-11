// src\config\database.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('MISSING ENVIRONMENT VARIABLES:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nCopy .env.example to .env and fill in your Supabase credentials');
  process.exit(1);
}

const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'X-Client-Info': 'agrimarket-backend'
      }
    }
  }
);

const supabaseService = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'X-Client-Info': 'agrimarket-service'
      }
    }
  }
);

async function testConnection() {
  try {
    const { data, error } = await supabaseAnon
      .from('users')
      .select('count')
      .limit(1);

    if (error) {
      console.error('Database connection test FAILED:', error.message);
      return {
        success: false,
        error: error.message
      };
    }

    console.log('Database connection successful!');
    return {
      success: true,
      message: 'Connected to Supabase'
    };

  } catch (error) {
    console.error('Database connection test ERROR:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

async function validateSchema() {
  const requiredTables = [
    'users',
    'buyer_profiles',
    'seller_profiles',
    'products',
    'orders',
    'order_items',
    'shopping_carts',
    'messages',
    'verification_documents',
    'issue_reports',
    'notifications',
    'admin_logs',
    'product_tags'
  ];

  const results = {
    success: true,
    existingTables: [],
    missingTables: []
  };

  try {
    for (const tableName of requiredTables) {
      const { error } = await supabaseService
        .from(tableName)
        .select('*')
        .limit(0);

      if (error) {
        results.missingTables.push(tableName);
        results.success = false;
      } else {
        results.existingTables.push(tableName);
      }
    }

    if (results.success) {
      console.log(`All ${requiredTables.length} tables found!`);
    } else {
      console.error('Missing tables:', results.missingTables);
      console.log('📝 Run the database schema SQL in Supabase SQL Editor');
    }

    return results;

  } catch (error) {
    console.error('Schema validation ERROR:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  supabase: supabaseAnon,
  supabaseAnon,
  supabaseService,
  testConnection,
  validateSchema
};