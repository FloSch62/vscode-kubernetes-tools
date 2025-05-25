import * as vscode from 'vscode';
import { loadKubeconfig, getKubeconfigPath } from './components/kubectl/kubeconfig';
import * as k8s from '@kubernetes/client-node';

const output = vscode.window.createOutputChannel('Minimal K8s');

export function activate(context: vscode.ExtensionContext) {
    output.appendLine('=== MINIMAL K8S EXTENSION ACTIVATED ===');
    
    let disposable = vscode.commands.registerCommand('minimal-k8s.listNamespaces', async () => {
        output.show(true);
        output.appendLine('\n=== STARTING NAMESPACE LIST OPERATION ===');
        output.appendLine(`Time: ${new Date().toISOString()}`);
        
        try {
            // Step 1: Get kubeconfig path
            output.appendLine('\n--- STEP 1: Getting kubeconfig path ---');
            const kubeconfigPath = getKubeconfigPath(output);
            output.appendLine(`Kubeconfig path result: ${JSON.stringify(kubeconfigPath, null, 2)}`);
            
            // Step 2: Load kubeconfig
            output.appendLine('\n--- STEP 2: Loading kubeconfig ---');
            const kubeconfig = await loadKubeconfig(output);
            output.appendLine('Kubeconfig loaded successfully');
            output.appendLine(`Current context: ${kubeconfig.getCurrentContext()}`);
            output.appendLine(`Current cluster: ${JSON.stringify(kubeconfig.getCurrentCluster())}`);
            output.appendLine(`Current user: ${JSON.stringify(kubeconfig.getCurrentUser())}`);
            
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
            
            output.appendLine(`\nSanitized kubeconfig: ${JSON.stringify(sanitizedConfig, null, 2)}`);
            
            // Step 3: Create API client
            output.appendLine('\n--- STEP 3: Creating K8s API client ---');
            const k8sApi = kubeconfig.makeApiClient(k8s.CoreV1Api);
            output.appendLine('K8s API client created');
            
            // Log the request configuration
            const cluster = kubeconfig.getCurrentCluster();
            output.appendLine('\n--- API Request Configuration ---');
            output.appendLine(`Server URL: ${cluster?.server}`);
            output.appendLine(`Skip TLS Verify: ${cluster?.skipTLSVerify}`);
            output.appendLine(`Current User: ${kubeconfig.getCurrentUser()?.name}`);
            
            // Step 4: Make API call to list namespaces
            output.appendLine('\n--- STEP 4: Making API call to list namespaces ---');
            output.appendLine('API Endpoint: GET /api/v1/namespaces');
            
            const startTime = Date.now();
            const response = await k8sApi.listNamespace();
            const endTime = Date.now();
            
            output.appendLine(`API call completed in ${endTime - startTime}ms`);
            output.appendLine(`Response status: ${response.response.statusCode}`);
            output.appendLine(`Response headers: ${JSON.stringify(response.response.headers)}`);
            
            const namespaces = response.body.items;
            
            output.appendLine(`\n--- RESULTS: Found ${namespaces.length} namespaces ---`);
            namespaces.forEach((ns: k8s.V1Namespace, index: number) => {
                output.appendLine(`\n${index + 1}. Namespace: ${ns.metadata?.name}`);
                output.appendLine(`   UID: ${ns.metadata?.uid}`);
                output.appendLine(`   Created: ${ns.metadata?.creationTimestamp}`);
                output.appendLine(`   Status: ${ns.status?.phase}`);
                output.appendLine(`   Labels: ${JSON.stringify(ns.metadata?.labels || {})}`);
                output.appendLine(`   Annotations: ${JSON.stringify(ns.metadata?.annotations || {})}`);
            });
            
            // Determine active namespace
            const currentContext = kubeconfig.getContextObject(kubeconfig.getCurrentContext() || '');
            const activeNamespace = currentContext?.namespace || 'default';
            output.appendLine(`\nActive namespace: ${activeNamespace}`);
            
            vscode.window.showInformationMessage(`Found ${namespaces.length} namespaces. Check the 'Minimal K8s' output channel for details.`);
            
        } catch (error: any) {
            output.appendLine('\n=== ERROR OCCURRED ===');
            output.appendLine(`Error type: ${error.constructor.name}`);
            output.appendLine(`Error message: ${error.message}`);
            output.appendLine(`Error stack: ${error.stack}`);
            
            if (error.response) {
                output.appendLine(`Response status: ${error.response.statusCode}`);
                output.appendLine(`Response headers: ${JSON.stringify(error.response.headers)}`);
                output.appendLine(`Response body: ${error.body || error.response.body}`);
            }
            
            vscode.window.showErrorMessage(`Failed to list namespaces: ${error.message}. See the 'Minimal K8s' output channel for details.`);
        }
    });
    
    context.subscriptions.push(disposable);
}

export function deactivate() {}