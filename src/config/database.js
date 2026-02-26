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
    // Use service client for backend health checks because API routes also use
    // service-role access with app-level JWT auth (not Supabase Auth JWT).
    const { data, error } = await supabaseService
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
    'product_tags',
    'product_reviews',
    'product_views',
    'orders',
    'order_items',
    'shopping_carts',
    'messages',
    'verification_documents',
    'issue_reports',
    'notifications',
    'admin_logs'
  ];
  const optionalTables = [
    // Added by later migrations. Some environments may not have this table yet.
    'issue_timeline_events'
  ];

  const projectRef = (() => {
    try {
      const url = new URL(process.env.SUPABASE_URL);
      return url.hostname.split('.')[0] || null;
    } catch (error) {
      return null;
    }
  })();

  const results = {
    success: true,
    projectRef,
    existingTables: [],
    missingTables: [],
    existingOptionalTables: [],
    missingOptionalTables: [],
    missingColumns: []
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

    for (const tableName of optionalTables) {
      const { error } = await supabaseService
        .from(tableName)
        .select('*')
        .limit(0);

      if (error) {
        results.missingOptionalTables.push(tableName);
      } else {
        results.existingOptionalTables.push(tableName);
      }
    }

    if (results.missingTables.length > 0) {
      console.error('Missing tables:', results.missingTables);
      console.log('📝 Run the database schema SQL in Supabase SQL Editor');
    }

    if (results.success) {
      console.log(`All ${requiredTables.length} required tables found!`);
      if (optionalTables.length > 0) {
        console.log(
          `Optional tables found: ${results.existingOptionalTables.length}/${optionalTables.length}`
        );
      }
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
  // Default backend client: service-role.
  // This keeps existing server queries working after enabling RLS while
  // authorization remains enforced in app middleware/controllers.
  supabase: supabaseService,
  supabaseAnon,
  supabaseService,
  testConnection,
  validateSchema
};
