'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/dashboard/page-header'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { ShoppingCart, Plus, Loader2 } from 'lucide-react'

export default function ProductsPage() {
  const { workspaceId } = useAuthStore()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)

  const loadProducts = async () => {
    if (!workspaceId) return
    try {
      const data = await api.get(`/workspaces/${workspaceId}/products`)
      setProducts(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProducts() }, [workspaceId])

  const addProduct = async () => {
    if (!workspaceId || !name || !price) return
    setSaving(true)
    try {
      await api.post(`/workspaces/${workspaceId}/products`, {
        name,
        description,
        price: parseFloat(price),
      })
      setName('')
      setDescription('')
      setPrice('')
      setShowForm(false)
      loadProducts()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const deleteProduct = async (id: string) => {
    if (!confirm('Delete this product?')) return
    await api.delete(`/workspaces/${workspaceId}/products/${id}`)
    loadProducts()
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div>
      <PageHeader title="Produtos" description="Gerencie seus produtos e serviços">
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Produto
        </Button>
      </PageHeader>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">New Product</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Product Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Digital Course" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <div>
              <Label>Price (R$)</Label>
              <Input type="number" step="0.01" min="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="197.90" />
            </div>
            <Button onClick={addProduct} disabled={!name || !price || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Product
            </Button>
          </CardContent>
        </Card>
      )}

      {products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No products yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product: any) => (
            <Card key={product.id}>
              <CardHeader>
                <CardTitle className="text-base">{product.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {product.description && (
                  <p className="text-sm text-muted-foreground mb-2">{product.description}</p>
                )}
                <p className="text-2xl font-bold text-primary">
                  R$ {Number(product.price).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Created {new Date(product.createdAt).toLocaleDateString()}
                </p>
                <Button variant="destructive" size="sm" className="mt-4" onClick={() => deleteProduct(product.id)}>
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
