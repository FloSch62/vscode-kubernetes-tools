import * as vscode from 'vscode';
import { loadKubeconfig, getKubeconfigPath } from './components/kubectl/kubeconfig';
import * as k8s from '@kubernetes/client-node';

export function activate(context: vscode.ExtensionContext) {
    console.log('=== MINIMAL K8S EXTENSION ACTIVATED ===');
    
    let disposable = vscode.commands.registerCommand('minimal-k8s.listNamespaces', async () => {
        console.log('\n=== STARTING NAMESPACE LIST OPERATION ===');
        console.log(`Time: ${new Date().toISOString()}`);
        
        try {
            // Step 1: Get kubeconfig path
            console.log('\n--- STEP 1: Getting kubeconfig path ---');
            const kubeconfigPath = getKubeconfigPath();
            console.log('Kubeconfig path result:', JSON.stringify(kubeconfigPath, null, 2));
            
            // Step 2: Load kubeconfig
            console.log('\n--- STEP 2: Loading kubeconfig ---');
            const kubeconfig = await loadKubeconfig();
            console.log('Kubeconfig loaded successfully');
            console.log('Current context:', kubeconfig.getCurrentContext());
            console.log('Current cluster:', kubeconfig.getCurrentCluster());
            console.log('Current user:', kubeconfig.getCurrentUser());
            
            // Log the raw config (without sensitive data)
            const rawConfig = kubeconfig.exportConfig();
            const sanitizedConfig = JSON.parse(JSON.stringify(rawConfig));
            
            // Remove sensitive data for logging
            if (sanitizedConfig.users) {
                sanitizedConfig.users.forEach((user: any) => {
                    if (user.user) {
                        if (user.user.token) user.user.token = '[REDACTED]';
                        if (user.user['client-certificate-data']) user.user['client-certificate-data'] = '[REDACTED]';
                        if (user.user['client-key-data']) user.user['client-key-data'] = '[REDACTED]';
                        if (user.user['access-token']) user.user['access-token'] = '[REDACTED]';
                        if (user.user.password) user.user.password = '[REDACTED]';
                    }
                });
            }
            if (sanitizedConfig.clusters) {
                sanitizedConfig.clusters.forEach((cluster: any) => {
                    if (cluster.cluster && cluster.cluster['certificate-authority-data']) {
                        cluster.cluster['certificate-authority-data'] = '[REDACTED]';
                    }
                });
            }
            
            console.log('\nSanitized kubeconfig:', JSON.stringify(sanitizedConfig, null, 2));
            
            // Step 3: Create API client
            console.log('\n--- STEP 3: Creating K8s API client ---');
            const k8sApi = kubeconfig.makeApiClient(k8s.CoreV1Api);
            console.log('K8s API client created');
            
            // Log the request configuration
            const cluster = kubeconfig.getCurrentCluster();
            console.log('\n--- API Request Configuration ---');
            console.log('Server URL:', cluster?.server);
            console.log('Skip TLS Verify:', cluster?.skipTLSVerify);
            console.log('Current User:', kubeconfig.getCurrentUser()?.name);
            
            // Step 4: Make API call to list namespaces
            console.log('\n--- STEP 4: Making API call to list namespaces ---');
            console.log('API Endpoint: GET /api/v1/namespaces');
            
            const startTime = Date.now();
            const response = await k8sApi.listNamespace();
            const endTime = Date.now();
            
            console.log(`API call completed in ${endTime - startTime}ms`);
            console.log('Response status:', response.response.statusCode);
            console.log('Response headers:', response.response.headers);
            
            const namespaces = response.body.items;
            
            console.log(`\n--- RESULTS: Found ${namespaces.length} namespaces ---`);
            namespaces.forEach((ns: k8s.V1Namespace, index: number) => {
                console.log(`\n${index + 1}. Namespace: ${ns.metadata?.name}`);
                console.log(`   UID: ${ns.metadata?.uid}`);
                console.log(`   Created: ${ns.metadata?.creationTimestamp}`);
                console.log(`   Status: ${ns.status?.phase}`);
                console.log(`   Labels: ${JSON.stringify(ns.metadata?.labels || {})}`);
                console.log(`   Annotations: ${JSON.stringify(ns.metadata?.annotations || {})}`);
            });
            
            // Determine active namespace
            const currentContext = kubeconfig.getContextObject(kubeconfig.getCurrentContext() || '');
            const activeNamespace = currentContext?.namespace || 'default';
            console.log(`\nActive namespace: ${activeNamespace}`);
            
            vscode.window.showInformationMessage(`Found ${namespaces.length} namespaces. Check the console (Help > Toggle Developer Tools) for details.`);
            
        } catch (error: any) {
            console.error('\n=== ERROR OCCURRED ===');
            console.error('Error type:', error.constructor.name);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            
            if (error.response) {
                console.error('Response status:', error.response.statusCode);
                console.error('Response headers:', error.response.headers);
                console.error('Response body:', error.body || error.response.body);
            }
            
            vscode.window.showErrorMessage(`Failed to list namespaces: ${error.message}`);
        }
    });
    
    context.subscriptions.push(disposable);
}

export function deactivate() {}