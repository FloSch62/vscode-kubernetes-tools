import * as vscode from 'vscode';
import * as path from 'path';
import * as shelljs from 'shelljs';

export interface HostKubeconfigPath {
    readonly pathType: 'host';
    readonly hostPath: string;
}

export interface WSLKubeconfigPath {
    readonly pathType: 'wsl';
    readonly wslPath: string;
}

export type KubeconfigPath = HostKubeconfigPath | WSLKubeconfigPath;

export async function loadKubeconfig(output?: vscode.OutputChannel): Promise<any> {
    const kubernetes = await import('@kubernetes/client-node');
    const kubeconfig = new kubernetes.KubeConfig();
    const kubeconfigPath = getKubeconfigPath(output);
    output?.appendLine(`[loadKubeconfig] Using kubeconfig path type: ${kubeconfigPath.pathType}`);
    if (kubeconfigPath.pathType === 'host') {
        output?.appendLine(`[loadKubeconfig] Loading from host path: ${kubeconfigPath.hostPath}`);
    } else {
        output?.appendLine(`[loadKubeconfig] Loading from WSL path: ${kubeconfigPath.wslPath}`);
    }

    if (kubeconfigPath.pathType === 'host') {
        kubeconfig.loadFromFile(kubeconfigPath.hostPath);
        output?.appendLine('[loadKubeconfig] Kubeconfig loaded from file');
    } else if (kubeconfigPath.pathType === 'wsl') {
        const result = shelljs.exec(`wsl.exe sh -c "cat ${kubeconfigPath.wslPath}"`, { silent: true }) as shelljs.ExecOutputReturnValue;
        if (!result) {
            throw new Error(`Impossible to retrieve the kubeconfig content from WSL at path '${kubeconfigPath.wslPath}'. No result from the shelljs.exe call.`);
        }

        if (result.code !== 0) {
            throw new Error(`Impossible to retrieve the kubeconfig content from WSL at path '${kubeconfigPath.wslPath}. Error code: ${result.code}. Error output: ${result.stderr.trim()}`);
        }

        kubeconfig.loadFromString(result.stdout.trim());
        output?.appendLine('[loadKubeconfig] Kubeconfig loaded from WSL');
    } else {
        throw new Error(`Kubeconfig path type is not recognized.`);
    }

    output?.appendLine('[loadKubeconfig] Kubeconfig loading finished');
    return kubeconfig;
}

export function getKubeconfigPath(output?: vscode.OutputChannel): KubeconfigPath {
    output?.appendLine('[getKubeconfigPath] Determining kubeconfig path');
    // Check if the user has configured to use WSL
    const useWsl = vscode.workspace.getConfiguration().get<boolean>("vs-kubernetes.use-wsl", false);
    output?.appendLine(`[getKubeconfigPath] useWsl: ${useWsl}`);
    
    // Check if user has specified a kubeconfig path
    let kubeconfigPath: string | undefined = vscode.workspace.getConfiguration().get<string>("vs-kubernetes.kubeconfig");
    output?.appendLine(`[getKubeconfigPath] configured kubeconfigPath: ${kubeconfigPath}`);

    if (useWsl) {
        if (!kubeconfigPath) {
            // User is using WSL: we want to use the same default that kubectl uses on Linux ($KUBECONFIG or home directory).
            const result = shelljs.exec('wsl.exe sh -c "echo ${KUBECONFIG:-$HOME/.kube/config}"', { silent: true }) as shelljs.ExecOutputReturnValue;
            output?.appendLine('[getKubeconfigPath] querying WSL for kubeconfig path');
            if (!result) {
                throw new Error(`Impossible to retrieve the kubeconfig path from WSL. No result from the shelljs.exe call.`);
            }

            if (result.code !== 0) {
                throw new Error(`Impossible to retrieve the kubeconfig path from WSL. Error code: ${result.code}. Error output: ${result.stderr.trim()}`);
            }
            kubeconfigPath = result.stdout.trim();
            output?.appendLine(`[getKubeconfigPath] WSL kubeconfig path: ${kubeconfigPath}`);
        }
        output?.appendLine(`[getKubeconfigPath] final WSL kubeconfig path: ${kubeconfigPath}`);
        return {
            pathType: 'wsl',
            wslPath: kubeconfigPath
        };
    }

    if (!kubeconfigPath) {
        kubeconfigPath = process.env['KUBECONFIG'];
        output?.appendLine(`[getKubeconfigPath] env KUBECONFIG: ${kubeconfigPath}`);
    }
    if (!kubeconfigPath) {
        // Fall back on the default kubeconfig value.
        kubeconfigPath = path.join((process.env['HOME'] || process.env['USERPROFILE'] || '.'), '.kube', 'config');
        output?.appendLine(`[getKubeconfigPath] defaulting kubeconfig path to ${kubeconfigPath}`);
    }
    output?.appendLine(`[getKubeconfigPath] final kubeconfig path: ${kubeconfigPath}`);
    return {
        pathType: 'host',
        hostPath: kubeconfigPath
    };
}